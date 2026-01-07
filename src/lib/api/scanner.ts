/**
 * Solana Token Scanner
 * Real on-chain analysis for SPL tokens
 */

import { PublicKey, type ParsedAccountData } from "@solana/web3.js";
import { connection, getConnection } from "@/lib/solana";
import type { AuditResult, RiskLevel, RiskFactor, TokenData, BondingCurveStatus, CreatorWalletAnalysis, CreatorStatus } from "@/types";
import { analyzeTokenRisk, type AIAnalysisResult } from "@/lib/ai/analyst";
import { getTokenSocials } from "@/lib/api/dexscreener";
import { getCreatorHistory, type CreatorTokenHistory } from "@/lib/api/historian";
import { getMarketAnalysis, type MarketAnalysis } from "@/lib/api/market";
import { scrapeWebsiteText } from "@/lib/api/scraper";

export interface TokenAnalysis {
  // Basic token info
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  supply: number;
  
  // Authority checks
  mintAuthority: string | null;
  freezeAuthority: string | null;
  
  // Holder distribution
  topHolders: { address: string; balance: number; percentage: number }[];
  topHoldersPercentage: number;
  
  // Risk assessment
  riskFactors: RiskFactor[];
  riskScore: number;
  riskLevel: RiskLevel;
}

/**
 * Validates if a string is a valid Solana public key
 */
export function isValidPublicKey(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if error is an RPC rate limit or access error
 */
function isRpcError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes("403") || 
           msg.includes("429") || 
           msg.includes("forbidden") || 
           msg.includes("rate limit") ||
           msg.includes("too many requests");
  }
  return false;
}

/**
 * Fetches and parses token mint account data with retry logic
 */
async function getTokenMintInfo(mintAddress: PublicKey, retryCount = 0): Promise<Record<string, unknown>> {
  const maxRetries = 3;
  
  try {
    const conn = retryCount === 0 ? connection : getConnection(retryCount);
    const accountInfo = await conn.getParsedAccountInfo(mintAddress);
    
    if (!accountInfo.value) {
      throw new Error("Token not found. This address may not exist on-chain.");
    }
    
    const data = accountInfo.value.data;
    
    // Check if it's parsed SPL token data
    if (typeof data === "object" && "parsed" in data) {
      const parsed = data as ParsedAccountData;
      
      // Accept both standard SPL Token and Token-2022 (used by Pump.fun)
      if (parsed.program !== "spl-token" && parsed.program !== "spl-token-2022") {
        throw new Error("Not a valid SPL Token. This may be a wallet or program address.");
      }
      
      return parsed.parsed.info;
    }
    
    throw new Error("Unable to parse token data. This may not be a standard SPL token.");
  } catch (error) {
    // Retry with fallback RPC if rate limited
    if (isRpcError(error) && retryCount < maxRetries) {
      console.log(`RPC error, retrying with fallback endpoint ${retryCount + 1}...`);
      await new Promise(resolve => setTimeout(resolve, 500 * (retryCount + 1)));
      return getTokenMintInfo(mintAddress, retryCount + 1);
    }
    throw error;
  }
}

/**
 * Fetches top token holders and calculates distribution
 */
async function getHolderDistribution(mintAddress: PublicKey, totalSupply: number, decimals: number) {
  try {
    const largestAccounts = await connection.getTokenLargestAccounts(mintAddress);
    
    const topHolders = largestAccounts.value.slice(0, 10).map((account) => {
      const balance = Number(account.amount) / Math.pow(10, decimals);
      const percentage = totalSupply > 0 ? (balance / totalSupply) * 100 : 0;
      
      return {
        address: account.address.toBase58(),
        balance,
        percentage,
      };
    });
    
    const topHoldersPercentage = topHolders.reduce((sum, h) => sum + h.percentage, 0);
    
    return { topHolders, topHoldersPercentage };
  } catch (error) {
    console.error("Error fetching holder distribution:", error);
    return { topHolders: [], topHoldersPercentage: 0 };
  }
}

/**
 * Analyzes the creator wallet to detect dev dumps
 * Checks if the updateAuthority/creator is still holding tokens
 */
function getCreatorAnalysis(
  mintAuthority: string | null,
  freezeAuthority: string | null,
  topHolders: { address: string; balance: number; percentage: number }[],
  totalSupply: number
): CreatorStatus {
  // The creator is usually the mintAuthority or freezeAuthority (before renouncing)
  // For renounced tokens, we check if any top holder matches common creator patterns
  const potentialCreator = mintAuthority || freezeAuthority;
  
  // Check if creator address is among top holders
  let creatorBalance = 0;
  let creatorPercentage = 0;
  let creatorAddress = potentialCreator || "Unknown";
  
  if (potentialCreator) {
    // Find creator in top holders
    const creatorHolding = topHolders.find(h => h.address === potentialCreator);
    if (creatorHolding) {
      creatorBalance = creatorHolding.balance;
      creatorPercentage = creatorHolding.percentage;
    }
  } else {
    // If authority is renounced, use the largest holder as potential creator
    // This is a heuristic - in reality, the creator may have sold
    if (topHolders.length > 0) {
      creatorAddress = topHolders[0].address;
      creatorBalance = topHolders[0].balance;
      creatorPercentage = topHolders[0].percentage;
    }
  }
  
  // Dev dump detection: Creator holds < 1% = likely sold out
  const isDumped = creatorPercentage < 1 && totalSupply > 0;
  
  // Whale warning: Creator holds > 20% = centralization risk
  const isWhale = creatorPercentage > 20;
  
  console.log(`[Veritas] Creator ${creatorAddress.slice(0, 8)}... holds ${creatorPercentage.toFixed(2)}% | Dumped: ${isDumped} | Whale: ${isWhale}`);
  
  return {
    creatorAddress,
    creatorBalance,
    creatorPercentage,
    isDumped,
    isWhale,
  };
}

/**
 * Calculates risk score based on analysis results
 */
function calculateRiskScore(
  mintAuthority: string | null,
  freezeAuthority: string | null,
  topHoldersPercentage: number
): { score: number; level: RiskLevel; factors: RiskFactor[] } {
  const factors: RiskFactor[] = [];
  let score = 0;

  // Mint Authority Check (Critical - 30 points)
  if (mintAuthority) {
    score += 30;
    factors.push({
      id: "mint_auth",
      name: "Mint Authority",
      description: "Mint authority is still active. Creator can mint unlimited tokens.",
      severity: "high",
      weight: 30,
    });
  } else {
    factors.push({
      id: "mint_auth",
      name: "Mint Authority",
      description: "Mint authority has been disabled. No new tokens can be minted.",
      severity: "safe",
      weight: 30,
    });
  }

  // Freeze Authority Check (High - 20 points)
  if (freezeAuthority) {
    score += 20;
    factors.push({
      id: "freeze_auth",
      name: "Freeze Authority",
      description: "Freeze authority is active. Holder accounts can be frozen.",
      severity: "medium",
      weight: 20,
    });
  } else {
    factors.push({
      id: "freeze_auth",
      name: "Freeze Authority",
      description: "Freeze authority has been disabled. Tokens cannot be frozen.",
      severity: "safe",
      weight: 20,
    });
  }

  // Holder Concentration Check (Variable - up to 40 points)
  if (topHoldersPercentage > 80) {
    score += 40;
    factors.push({
      id: "holder_concentration",
      name: "Holder Distribution",
      description: `Critical: Top 10 holders control ${topHoldersPercentage.toFixed(1)}% of supply.`,
      severity: "critical",
      weight: 40,
    });
  } else if (topHoldersPercentage > 60) {
    score += 30;
    factors.push({
      id: "holder_concentration",
      name: "Holder Distribution",
      description: `Warning: Top 10 holders control ${topHoldersPercentage.toFixed(1)}% of supply.`,
      severity: "high",
      weight: 30,
    });
  } else if (topHoldersPercentage > 40) {
    score += 15;
    factors.push({
      id: "holder_concentration",
      name: "Holder Distribution",
      description: `Moderate: Top 10 holders control ${topHoldersPercentage.toFixed(1)}% of supply.`,
      severity: "medium",
      weight: 15,
    });
  } else {
    factors.push({
      id: "holder_concentration",
      name: "Holder Distribution",
      description: `Healthy: Top 10 holders control ${topHoldersPercentage.toFixed(1)}% of supply.`,
      severity: "safe",
      weight: 0,
    });
  }

  // Determine risk level
  let level: RiskLevel;
  if (score < 15) level = "safe";
  else if (score < 30) level = "low";
  else if (score < 50) level = "medium";
  else if (score < 70) level = "high";
  else level = "critical";

  return { score, level, factors };
}

/**
 * Main token analysis function
 * Performs parallel on-chain checks
 */
export async function analyzeToken(address: string): Promise<AuditResult> {
  // Validate address
  if (!isValidPublicKey(address)) {
    throw new Error("Invalid Solana address format.");
  }

  const mintAddress = new PublicKey(address);

  // Fetch mint info first (to validate it's a token)
  const mintInfo = await getTokenMintInfo(mintAddress);
  
  const decimals = (mintInfo.decimals as number) || 0;
  const supply = Number(mintInfo.supply) / Math.pow(10, decimals);
  const mintAuthority = (mintInfo.mintAuthority as string) || null;
  const freezeAuthority = (mintInfo.freezeAuthority as string) || null;

  // Fetch holder distribution in parallel where possible
  const { topHolders, topHoldersPercentage } = await getHolderDistribution(
    mintAddress,
    supply,
    decimals
  );

  // Analyze creator wallet for dev dump detection
  const creatorStatus = getCreatorAnalysis(
    mintAuthority,
    freezeAuthority,
    topHolders,
    supply
  );

  // Calculate math-based risk assessment (fallback)
  const mathBased = calculateRiskScore(
    mintAuthority,
    freezeAuthority,
    topHoldersPercentage
  );

  // Fetch social links FIRST (needed for vision analysis)
  const socials = await getTokenSocials(address);
  
  // Construct Microlink screenshot URL for vision analysis
  let screenshotUrl: string | undefined;
  if (socials.website) {
    screenshotUrl = `https://api.microlink.io/?url=${encodeURIComponent(socials.website)}&screenshot=true&meta=false&embed=screenshot.url&waitForTimeout=4000&waitUntil=networkidle0`;
    console.log("[Veritas] 📸 Screenshot URL prepared for vision analysis");
  }

  // The Historian: Fetch creator's token launch history
  let creatorHistory: CreatorTokenHistory[] = [];
  try {
    creatorHistory = await getCreatorHistory(creatorStatus.creatorAddress);
    if (creatorHistory.length > 0) {
      console.log(`[Veritas] 📜 Historian found ${creatorHistory.length} previous tokens by this creator`);
    }
  } catch (historyError) {
    console.warn("[Veritas] Historian failed:", historyError);
  }

  // The Market Watcher: Fetch market data and detect anomalies
  let marketAnalysis: MarketAnalysis | null = null;
  try {
    marketAnalysis = await getMarketAnalysis(address);
    if (marketAnalysis) {
      console.log(`[Veritas] 📊 Market Watcher: Bot Activity ${marketAnalysis.botActivity}`);
    }
  } catch (marketError) {
    console.warn("[Veritas] Market Watcher failed:", marketError);
  }

  // Website Text Scraper: Fetch readable text for cross-examination
  let websiteText: string | undefined;
  if (socials.website) {
    try {
      const scraped = await scrapeWebsiteText(socials.website);
      if (scraped?.content) {
        websiteText = scraped.content;
        console.log(`[Veritas] 📖 Scraped ${scraped.wordCount} words from website for lie detection`);
      }
    } catch (scrapeError) {
      console.warn("[Veritas] Website scraper failed:", scrapeError);
    }
  }

  // Try AI-powered analysis with Gemini
  let aiResult: AIAnalysisResult | null = null;
  let finalScore = mathBased.score;
  let finalLevel = mathBased.level;
  let recommendations: string[] = [];
  let visualAnalysis: string | undefined;

  try {
    aiResult = await analyzeTokenRisk({
      mintAuth: mintAuthority,
      freezeAuth: freezeAuthority,
      top10Percentage: topHoldersPercentage,
      supply,
      decimals,
      // Pass creator data to AI
      creatorAddress: creatorStatus.creatorAddress,
      creatorPercentage: creatorStatus.creatorPercentage,
      isDumped: creatorStatus.isDumped,
      isWhale: creatorStatus.isWhale,
      // Pass screenshot for vision analysis
      screenshotUrl,
      // The Historian data
      creatorHistory,
      // The Market Watcher data
      marketAnalysis,
      // Website text for cross-examination
      websiteText,
    });

    if (aiResult) {
      // AI returns safety score (100 = safe), convert to risk score (0 = safe)
      finalScore = 100 - aiResult.riskScore;
      
      // Map AI verdict to RiskLevel
      finalLevel = mapVerdictToRiskLevel(aiResult.verdict, finalScore);
      
      // Use AI analysis as recommendations
      recommendations = [
        aiResult.summary,
        ...aiResult.analysis,
      ];
      
      // Store visual analysis if present
      if (aiResult.visualAnalysis) {
        visualAnalysis = aiResult.visualAnalysis;
      }
      
      console.log("[Veritas] AI analysis applied successfully");
    }
  } catch (error) {
    console.log("[Veritas] AI analysis failed, using math-based fallback:", error);
  }

  // Fallback to math-based recommendations if AI failed
  if (!aiResult) {
    if (creatorStatus.isDumped) {
      recommendations.push("⚠️ DEV SOLD OUT - Creator wallet is empty. High rug pull risk.");
    }
    if (creatorStatus.isWhale) {
      recommendations.push("⚠️ WHALE ALERT - Creator holds >20% of supply. Centralization risk.");
    }
    if (mintAuthority) {
      recommendations.push("Mint authority is enabled - creator can inflate supply at any time.");
    }
    if (freezeAuthority) {
      recommendations.push("Freeze authority is enabled - your tokens could be frozen.");
    }
    if (topHoldersPercentage > 50) {
      recommendations.push("High holder concentration - vulnerable to whale dumps.");
    }
    if (mathBased.score < 20 && !creatorStatus.isDumped) {
      recommendations.push("Token passes basic security checks. Always DYOR.");
    }
  }

  // Construct token data (basic info, name/symbol may require additional metadata fetch)
  // Construct token data (use DexScreener/socials for name if available)
  const tokenData: TokenData = {
    address,
    name: socials.name || "SPL Token",
    symbol: socials.symbol || "SPL",
    decimals,
    totalSupply: supply,
    creatorAddress: creatorStatus.creatorAddress,
    createdAt: new Date(), // Would need transaction history for real date
  };

  // Construct bonding curve status (placeholder for Pump.fun specific tokens)
  const bondingCurve: BondingCurveStatus = {
    isComplete: true, // Assume complete for non-Pump.fun tokens
    progress: 100,
    virtualSolReserves: 0,
    virtualTokenReserves: 0,
    realSolReserves: 0,
    realTokenReserves: 0,
  };

  // Construct creator analysis (placeholder)
  const creatorAnalysis: CreatorWalletAnalysis = {
    address: creatorStatus.creatorAddress,
    totalTokensCreated: 0,
    rugPullCount: 0,
    successfulTokens: 0,
    avgHoldTime: 0,
    totalSolExtracted: 0,
    firstActivityDate: new Date(),
    riskScore: finalScore,
  };



  return {
    tokenAddress: address,
    tokenData,
    bondingCurve,
    creatorAnalysis,
    creatorStatus,
    socials, // Added social links
    visualAnalysis, // What Gemini saw in the screenshot
    websiteText, // Scraped text from the website
    creatorHistory, // The Historian data
    marketAnalysis: marketAnalysis ?? undefined, // The Market Watcher data
    overallRiskLevel: finalLevel,
    riskScore: finalScore,
    riskFactors: mathBased.factors,
    auditedAt: new Date(),
    recommendations,
  };
}

/**
 * Map AI verdict to RiskLevel type
 */
function mapVerdictToRiskLevel(verdict: string, riskScore: number): RiskLevel {
  switch (verdict) {
    case "Safe":
      return riskScore < 15 ? "safe" : "low";
    case "Caution":
      return riskScore < 50 ? "medium" : "high";
    case "Danger":
      return riskScore >= 70 ? "critical" : "high";
    default:
      // Fallback based on score
      if (riskScore < 15) return "safe";
      if (riskScore < 30) return "low";
      if (riskScore < 50) return "medium";
      if (riskScore < 70) return "high";
      return "critical";
  }
}
