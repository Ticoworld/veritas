/**
 * The Historian - Creator Token History Tracker
 * Detects if a token creator has launched other tokens before
 * Uses Helius RPC to fetch transaction history
 */

import { PublicKey } from "@solana/web3.js";
import { connection } from "@/lib/solana";

/**
 * Pump.fun Program ID (mainnet)
 */
const PUMPFUN_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

/**
 * Represents a token previously created by the same creator
 */
export interface CreatorTokenHistory {
  tokenName: string;  // "Unknown" for MVP (metadata fetch would require additional calls)
  mint: string;       // Token mint address
  date: string;       // ISO date string
}

/**
 * Fetches the creator's token creation history from Pump.fun
 * 
 * Strategy: Fetch last 50 transactions and filter for Pump.fun "Create" instructions
 * This is safe and free for the hackathon MVP
 * 
 * @param creatorAddress - The wallet address of the token creator
 * @returns Array of tokens previously created by this wallet
 */
export async function getCreatorHistory(
  creatorAddress: string
): Promise<CreatorTokenHistory[]> {
  try {
    const raw = (creatorAddress || "").trim().toLowerCase();
    if (!raw || raw === "unknown" || raw === "null") {
      console.log("[Historian] No creator address (Unknown/null) — skipping history");
      return [];
    }

    let pubkey: PublicKey;
    try {
      pubkey = new PublicKey(creatorAddress);
    } catch {
      console.warn("[Historian] Invalid creator public key — skipping history");
      return [];
    }

    console.log(`[Historian] 🔍 Investigating creator: ${creatorAddress.slice(0, 8)}...`);
    
    // Fetch last 100 transaction signatures for this wallet (increased for better detection)
    const signatures = await connection.getSignaturesForAddress(pubkey, {
      limit: 100,
    });
    
    if (signatures.length === 0) {
      console.log("[Historian] No transactions found for creator");
      return [];
    }
    
    console.log(`[Historian] Found ${signatures.length} recent transactions, analyzing...`);
    
    const createdTokens: CreatorTokenHistory[] = [];
    
    // Fetch transactions ONE AT A TIME (Helius free tier doesn't support batch)
    // Check first 50 transactions to catch serial scammers (increased from 10)
    const signaturestoCheck = signatures.slice(0, 50);
    
    for (let i = 0; i < signaturestoCheck.length; i++) {
      const sig = signaturestoCheck[i];
      
      try {
        const tx = await connection.getParsedTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
        });
        
        if (!tx) continue;
        
        // Check if this transaction involves Pump.fun program
        const programIds = tx.transaction.message.accountKeys
          .filter(key => key.signer === false)
          .map(key => key.pubkey.toBase58());
        
        const involvesPumpfun = programIds.includes(PUMPFUN_PROGRAM_ID) ||
          tx.transaction.message.instructions.some(ix => {
            if ('programId' in ix) {
              return ix.programId.toBase58() === PUMPFUN_PROGRAM_ID;
            }
            return false;
          });
        
        if (!involvesPumpfun) continue;
        
        // Look for token creation pattern:
        // - Transaction has Pump.fun program
        // - Contains a new mint account initialization
        const innerInstructions = tx.meta?.innerInstructions || [];
        
        for (const inner of innerInstructions) {
          for (const ix of inner.instructions) {
            // Check for InitializeMint instruction (Token Program)
            if ('parsed' in ix && 
                ix.parsed?.type === 'initializeMint' &&
                ix.program === 'spl-token') {
              
              const mintAddress = ix.parsed.info?.mint;
              if (mintAddress) {
                // Avoid duplicates
                if (!createdTokens.find(t => t.mint === mintAddress)) {
                  createdTokens.push({
                    tokenName: "Unknown", // MVP: Skip metadata fetch
                    mint: mintAddress,
                    date: new Date((sig.blockTime || 0) * 1000).toISOString(),
                  });
                  
                  console.log(`[Historian] 🎯 Found created token: ${mintAddress.slice(0, 8)}...`);
                }
              }
            }
          }
        }
      } catch (txError) {
        // Skip failed transaction fetches
        console.warn(`[Historian] Skipping tx ${sig.signature.slice(0, 8)}...: ${txError}`);
      }
    }
    
    console.log(`[Historian] ✅ Creator has launched ${createdTokens.length} tokens via Pump.fun`);
    
    return createdTokens;
    
  } catch (error) {
    console.error("[Historian] Failed to fetch creator history:", error);
    return [];
  }
}
