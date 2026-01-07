/**
 * Unified Analysis API Route v2.0
 * Uses Gemini URL Context + Google Search in single call
 */

import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { runUnifiedAnalysis, type UnifiedAnalysisInput } from "@/lib/ai/unified-analyzer";
import { getTokenSocials } from "@/lib/api/dexscreener";
import { connection } from "@/lib/solana";
import { getMarketAnalysis } from "@/lib/api/market";
import { fetchScreenshotAsBase64, getMicrolinkUrl } from "@/lib/api/screenshot";

/**
 * Validate Solana address
 */
function isValidPublicKey(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch basic token info from chain
 */
async function getTokenInfo(mintAddress: PublicKey) {
  const info = await connection.getParsedAccountInfo(mintAddress);
  if (!info.value || !("parsed" in (info.value.data as any))) {
    throw new Error("Token not found or not a valid SPL token");
  }
  return (info.value.data as any).parsed.info;
}

/**
 * Fetch holder distribution
 */
async function getHolderDistribution(mintAddress: PublicKey, supply: number, decimals: number) {
  try {
    const accounts = await connection.getTokenLargestAccounts(mintAddress);
    const topHolders = accounts.value.slice(0, 10).map((acc) => {
      const balance = Number(acc.amount) / Math.pow(10, decimals);
      return {
        address: acc.address.toString(),
        balance,
        percentage: (balance / supply) * 100,
      };
    });
    const totalTop10 = topHolders.reduce((sum, h) => sum + h.percentage, 0);
    return { topHolders, top10Percentage: totalTop10 };
  } catch {
    return { topHolders: [], top10Percentage: 0 };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address } = body;

    if (!address || typeof address !== "string") {
      return NextResponse.json(
        { success: false, error: "Token address is required" },
        { status: 400 }
      );
    }

    if (!isValidPublicKey(address)) {
      return NextResponse.json(
        { success: false, error: "Invalid Solana address format" },
        { status: 400 }
      );
    }

    console.log(`[Unified API] 🚀 Starting unified analysis for ${address}`);
    const startTime = Date.now();

    const mintAddress = new PublicKey(address);

    // ═══════════════════════════════════════════════════════════════════
    // PARALLEL DATA FETCHING
    // ═══════════════════════════════════════════════════════════════════
    console.log("[Unified API] 📊 Fetching data in parallel...");
    
    const [tokenInfo, socials, marketData] = await Promise.all([
      getTokenInfo(mintAddress),
      getTokenSocials(address),
      getMarketAnalysis(address),
    ]);

    const decimals = tokenInfo.decimals || 0;
    const supply = Number(tokenInfo.supply) / Math.pow(10, decimals);
    const mintAuth = tokenInfo.mintAuthority || null;
    const freezeAuth = tokenInfo.freezeAuthority || null;

    // Get holder distribution (needs supply first)
    const { topHolders, top10Percentage } = await getHolderDistribution(
      mintAddress,
      supply,
      decimals
    );

    // Find creator percentage
    const creatorAddress = mintAuth || freezeAuth;
    let creatorPercentage = 0;
    let isDumped = false;
    let isWhale = false;

    if (creatorAddress) {
      const creatorHolding = topHolders.find((h) => h.address === creatorAddress);
      if (creatorHolding) {
        creatorPercentage = creatorHolding.percentage;
        isWhale = creatorPercentage > 20;
      } else {
        isDumped = true; // Creator not in top holders = likely sold
      }
    }

    // Get social links for Gemini to analyze
    const websiteUrl = socials?.website;
    const originalTwitterUrl = socials?.twitter; // Keep original for screenshot
    
    // Convert Twitter URL to Nitter for URL Context (since x.com blocks bots)
    let nitterUrl = originalTwitterUrl;
    if (nitterUrl) {
      nitterUrl = nitterUrl
        .replace('https://x.com/', 'https://nitter.net/')
        .replace('https://twitter.com/', 'https://nitter.net/');
      console.log(`[Unified API] 🐦 Will try Nitter for URL Context: ${nitterUrl}`);
    }

    // ═══════════════════════════════════════════════════════════════════
    // CAPTURE SCREENSHOTS IN PARALLEL (Website Full Page + Twitter)
    // ═══════════════════════════════════════════════════════════════════
    console.log("[Unified API] 📸 Capturing screenshots in parallel...");
    
    const [websiteScreenshot, twitterScreenshot] = await Promise.all([
      websiteUrl 
        ? fetchScreenshotAsBase64(getMicrolinkUrl(websiteUrl, true)) // Full page website
        : Promise.resolve(null),
      originalTwitterUrl 
        ? fetchScreenshotAsBase64(getMicrolinkUrl(originalTwitterUrl, false)) // Twitter viewport (bio/stats)
        : Promise.resolve(null),
    ]);

    if (websiteScreenshot) console.log("[Unified API] ✅ Website screenshot captured");
    if (twitterScreenshot) console.log("[Unified API] ✅ Twitter screenshot captured");

    // DEBUG: Save screenshots to artifacts for inspection
    if (websiteScreenshot) {
      const fs = await import('fs/promises');
      const path = await import('path');
      const artifactsDir = path.join(process.cwd(), 'public', 'debug-screenshots');
      await fs.mkdir(artifactsDir, { recursive: true });
      const buffer = Buffer.from(websiteScreenshot.base64, 'base64');
      await fs.writeFile(path.join(artifactsDir, 'website-full-page.png'), buffer);
      console.log("[Unified API] 🐛 DEBUG: Saved website screenshot to /public/debug-screenshots/website-full-page.png");
    }
    if (twitterScreenshot) {
      const fs = await import('fs/promises');
      const path = await import('path');
      const artifactsDir = path.join(process.cwd(), 'public', 'debug-screenshots');
      await fs.mkdir(artifactsDir, { recursive: true });
      const buffer = Buffer.from(twitterScreenshot.base64, 'base64');
      await fs.writeFile(path.join(artifactsDir, 'twitter-screenshot.png'), buffer);
      console.log("[Unified API] 🐛 DEBUG: Saved Twitter screenshot to /public/debug-screenshots/twitter-screenshot.png");
    }

    // Get token name from DexScreener
    const tokenName = socials?.name || "SPL Token";
    const tokenSymbol = socials?.symbol || "TOKEN";

    // ═══════════════════════════════════════════════════════════════════
    // UNIFIED GEMINI ANALYSIS (URL Context + Google Search)
    // ═══════════════════════════════════════════════════════════════════
    console.log("[Unified API] 🤖 Running unified Gemini analysis...");

    const analysisInput: UnifiedAnalysisInput = {
      tokenName,
      tokenSymbol,
      tokenAddress: address,
      mintAuth,
      freezeAuth,
      top10Percentage,
      creatorPercentage,
      isDumped,
      isWhale,
      websiteUrl,
      twitterUrl: nitterUrl, // Use Nitter URL for URL Context attempts
      marketData: marketData ? {
        liquidity: marketData.liquidity,
        volume24h: marketData.volume24h,
        marketCap: marketData.marketCap,
        buySellRatio: marketData.buySellRatio,
      } : undefined,
      websiteScreenshot: websiteScreenshot || undefined,
      twitterScreenshot: twitterScreenshot || undefined,
    };

    const unifiedResult = await runUnifiedAnalysis(analysisInput);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Unified API] ✅ Analysis complete in ${elapsed}s`);

    if (!unifiedResult) {
      return NextResponse.json(
        { success: false, error: "AI analysis failed" },
        { status: 500 }
      );
    }

    // Build response
    return NextResponse.json({
      success: true,
      data: {
        tokenAddress: address,
        tokenName,
        tokenSymbol,
        
        // Core verdict
        trustScore: unifiedResult.trustScore,
        verdict: unifiedResult.verdict,
        summary: unifiedResult.summary,
        criminalProfile: unifiedResult.criminalProfile,
        
        // Evidence
        lies: unifiedResult.lies,
        evidence: unifiedResult.evidence,
        analysis: unifiedResult.analysis,
        visualAnalysis: unifiedResult.visualAnalysis,
        
        // On-chain data
        onChain: {
          mintAuth: mintAuth ? "Enabled" : "Disabled",
          freezeAuth: freezeAuth ? "Enabled" : "Disabled",
          top10Percentage,
          creatorPercentage,
          isDumped,
          isWhale,
        },
        
        // Market data
        market: marketData,
        
        // Social links
        socials,
        
        // Metadata
        analyzedAt: new Date().toISOString(),
        analysisTimeSeconds: elapsed,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Unified API] ❌ Analysis error:", error);

    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
