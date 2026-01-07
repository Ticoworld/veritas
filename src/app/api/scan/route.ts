/**
 * Veritas Scan API Route
 * POST /api/scan
 * 
 * The main endpoint for scanning tokens through the Truth Engine
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchTruthData } from "@/lib/api/truth";
import { askVeritas, analyzeContext } from "@/lib/ai/veritas";
import { checkKnownScammer, flagScammer } from "@/lib/db/elephant";

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Basic Solana address validation
 * Solana addresses are base58 encoded and 32-44 characters
 */
function isValidSolanaAddress(address: string): boolean {
  if (!address || typeof address !== "string") return false;
  const trimmed = address.trim();
  // Base58 characters (no 0, O, I, l)
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  return base58Regex.test(trimmed);
}

// =============================================================================
// POST HANDLER
// =============================================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // =========================================================================
    // STEP 1: Parse and validate request
    // =========================================================================
    const body = await request.json();
    const { address } = body;

    if (!address) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Missing required field: address" 
        },
        { status: 400 }
      );
    }

    const cleanAddress = address.trim();

    if (!isValidSolanaAddress(cleanAddress)) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Invalid Solana address format. Expected 32-44 base58 characters." 
        },
        { status: 400 }
      );
    }

    console.log(`\n[API /scan] 🎯 Scan request for: ${cleanAddress.slice(0, 8)}...`);

    // =========================================================================
    // STEP 2: Fetch Truth Data (On-chain facts)
    // =========================================================================
    let truthData;
    try {
      truthData = await fetchTruthData(cleanAddress);
    } catch (error) {
      console.error("[API /scan] Failed to fetch truth data:", error);
      return NextResponse.json(
        { 
          success: false, 
          error: "Failed to fetch on-chain data. The token may not exist or RPC is unavailable." 
        },
        { status: 500 }
      );
    }

    // =========================================================================
    // STEP 2.5: ELEPHANT MEMORY - Check for known scammer
    // =========================================================================
    const deployerAddress = truthData.creatorHistory.creatorAddress;
    let knownScammer = null;
    
    if (deployerAddress) {
      knownScammer = await checkKnownScammer(deployerAddress);
      
      if (knownScammer) {
        // INSTANT BLOCK - Known criminal detected!
        const elapsed = Date.now() - startTime;
        console.log(`[API /scan] 🚨 INSTANT BLOCK in ${elapsed}ms | Known scammer: ${deployerAddress.slice(0, 8)}...`);
        
        return NextResponse.json({
          success: true,
          data: {
            truth: truthData,
            context: {
              status: "KNOWN_SCAMMER",
              flags: [
                `🚨 KNOWN CRIMINAL: This deployer (${deployerAddress.slice(0, 8)}...) was previously flagged for: ${knownScammer.reason}`,
                `📅 First flagged: ${knownScammer.flaggedAt.toISOString().split('T')[0]}`,
                `🔢 Detection count: ${knownScammer.scanCount} times`,
              ],
            },
            analysis: {
              verdict: "SCAM",
              headline: "🚨 KNOWN CRIMINAL DETECTED",
              summary: `This token was deployed by a known scammer. They were previously flagged for "${knownScammer.tokenName}" with verdict: ${knownScammer.verdict}. Do NOT interact with this token.`,
              degen_comment: "Bro this dev already rugged before. INSTANT BLOCK. Don't even think about it. 🚫",
              lies_detected: [`Deployer is a repeat offender - previously flagged for ${knownScammer.tokenName}`],
            },
            meta: {
              analysisAvailable: true,
              analysisError: null,
              scanTimeMs: elapsed,
              scannedAt: new Date().toISOString(),
              elephantMemory: true, // Flag that this was an instant block
            }
          }
        });
      }
    }

    // =========================================================================
    // STEP 3: Get AI Verdict (Veritas Analysis)
    // =========================================================================
    let analysis = null;
    let analysisError = null;

    try {
      analysis = await askVeritas(truthData);
      
      if (!analysis) {
        analysisError = "AI analysis returned no result";
        console.warn("[API /scan] Veritas returned null - continuing with data only");
      }
    } catch (error) {
      analysisError = error instanceof Error ? error.message : "Unknown AI error";
      console.error("[API /scan] Veritas analysis failed:", error);
      // Don't fail the request - return data without analysis
    }

    // =========================================================================
    // STEP 3.5: ELEPHANT MEMORY - Flag new scammers
    // =========================================================================
    if (analysis && deployerAddress && ["SCAM", "DANGER"].includes(analysis.verdict)) {
      // This is a new scammer - add to the database!
      const tokenName = truthData.tokenProfile.name || truthData.tokenProfile.symbol || "Unknown Token";
      await flagScammer(
        deployerAddress,
        cleanAddress,
        tokenName,
        analysis.verdict,
        analysis.headline
      );
    }

    // =========================================================================
    // STEP 4: Get pre-computed context flags
    // =========================================================================
    const context = analyzeContext(truthData);

    // =========================================================================
    // STEP 5: Build response
    // =========================================================================
    const elapsed = Date.now() - startTime;
    console.log(`[API /scan] ✅ Complete in ${elapsed}ms | Verdict: ${analysis?.verdict || "N/A"}`);

    return NextResponse.json({
      success: true,
      data: {
        // The raw forensic data
        truth: truthData,
        
        // Pre-computed context flags (hard rules)
        context: {
          status: context.status,
          flags: context.flags,
        },
        
        // AI-generated analysis (may be null if Gemini failed)
        analysis: analysis,
        
        // Metadata
        meta: {
          analysisAvailable: !!analysis,
          analysisError: analysisError,
          scanTimeMs: elapsed,
          scannedAt: new Date().toISOString(),
          elephantMemory: false,
        }
      }
    });

  } catch (error) {
    console.error("[API /scan] Unexpected error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "An unexpected error occurred" 
      },
      { status: 500 }
    );
  }
}

// =============================================================================
// OPTIONS HANDLER (CORS)
// =============================================================================

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
