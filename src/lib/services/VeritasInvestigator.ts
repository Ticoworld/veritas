/**
 * VERITAS INVESTIGATOR v3.1 — Speed Optimized
 * 
 * - LRU cache (5-min TTL) for repeat scans
 * - Skip screenshot for pump.fun tokens (template sites, saves ~5s)
 * - Parallel: holder dist + screenshot + creator history all at once
 * - AI ceiling: finalScore = min(deterministic, AI)
 */

import { PublicKey } from "@solana/web3.js";
import { connection } from "@/lib/solana";
import { fetchDexScreenerData } from "@/lib/api/dexscreener";
import { analyzeMarketData } from "@/lib/api/market";
import { getCreatorHistory } from "@/lib/api/historian";
import { fetchScreenshotAsBase64, getMicrolinkUrl } from "@/lib/api/screenshot";
import { fetchRugCheck, type RugCheckReport } from "@/lib/api/rugcheck";
import { runUnifiedAnalysis, type UnifiedAnalysisInput, type UnifiedAnalysisResult } from "@/lib/ai/unified-analyzer";
import { checkKnownScammer, flagScammer, type ScammerRecord } from "@/lib/db/elephant";
import { LRUCache } from "lru-cache";

// Persist cache across Next.js dev hot reloads using globalThis
const globalForCache = globalThis as unknown as {
  veritasResultCache?: LRUCache<string, InvestigationResult>;
};

const resultCache = globalForCache.veritasResultCache ??= new LRUCache<string, InvestigationResult>({
  max: 50,
  ttl: 5 * 60 * 1000, // 5 min
});

// =============================================================================
// TYPES
// =============================================================================

export interface InvestigationResult {
  trustScore: number;
  verdict: "Safe" | "Caution" | "Danger";
  summary: string;
  criminalProfile: string;
  lies: string[];
  evidence: string[];
  analysis: string[];
  visualAnalysis?: string;
  visualEvidenceStatus: "captured" | "not_captured";
  visualAssetReuse: "YES" | "NO" | "UNKNOWN";
  visualEvidenceSummary: string;
  veritasSays: string;
  degenComment: string;
  thoughtSummary?: string;
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  onChain: {
    mintAuth: string | null;
    freezeAuth: string | null;
    supply: number;
    decimals: number;
    top10Percentage: number;
    creatorPercentage: number;
    isDumped: boolean;
    isWhale: boolean;
  };
  market: {
    liquidity: number;
    volume24h: number;
    marketCap: number;
    buySellRatio: number;
    ageInHours: number;
    botActivity: string;
    anomalies: string[];
  } | null;
  rugCheck: {
    score: number;
    risks: Array<{
      name: string;
      description: string;
      level: string;
      score: number;
    }>;
  } | null;
  creatorHistory: {
    creatorAddress: string;
    previousTokens: number;
    isSerialLauncher: boolean;
  };
  socials: {
    website?: string;
    twitter?: string;
    telegram?: string;
    discord?: string;
  };
  elephantMemory: {
    isKnownScammer: boolean;
    previousFlags?: ScammerRecord;
  };
  analyzedAt: string;
  analysisTimeMs: number;
}

// =============================================================================
// VERITAS INVESTIGATOR
// =============================================================================

export class VeritasInvestigator {
  private startTime: number = 0;

  async investigate(tokenAddress: string): Promise<InvestigationResult> {
    // Normalize address for cache (trim whitespace only — base58 is case-sensitive!)
    const cacheKey = tokenAddress.trim();
    
    // Check cache first
    const cached = resultCache.get(cacheKey);
    if (cached) {
      console.log(`[Veritas] ⚡ Cache hit for ${tokenAddress.slice(0, 8)}`);
      return cached;
    }

    this.startTime = Date.now();
    console.log(`\n[Veritas] 🔍 Investigating ${tokenAddress.slice(0, 8)}...`);

    if (!this.isValidPublicKey(tokenAddress)) {
      throw new Error("Invalid Solana address format");
    }

    const mintAddress = new PublicKey(tokenAddress);

    // =====================================================================
    // PHASE 1: ELEPHANT MEMORY (Instant block for known scammers)
    // =====================================================================
    const tokenInfo = await this.getTokenInfo(mintAddress);
    const creatorAddress = tokenInfo.mintAuthority || tokenInfo.freezeAuthority;

    if (creatorAddress) {
      const knownScammer = await checkKnownScammer(creatorAddress);
      if (knownScammer) {
        const elapsed = Date.now() - this.startTime;
        console.log(`[Veritas] 🚨 INSTANT BLOCK in ${elapsed}ms`);
        return this.buildKnownScammerResult(tokenAddress, tokenInfo, creatorAddress, knownScammer, elapsed);
      }
    }

    // =====================================================================
    // PHASE 2: DATA PIPELINE — everything in parallel
    // =====================================================================
    console.log("[Veritas] 📊 Fetching data...");

    const decimals = tokenInfo.decimals || 0;
    const supply = Number(tokenInfo.supply) / Math.pow(10, decimals);
    const isPumpFun = tokenAddress.toLowerCase().endsWith("pump");

    // Fire ALL fetches in parallel
    const [dexResult, rugCheckReport, holderResult] = await Promise.all([
      fetchDexScreenerData(tokenAddress),
      fetchRugCheck(tokenAddress),
      this.getHolderDistribution(mintAddress, supply, decimals),
    ]);

    const { socials, pairData } = dexResult;
    const marketData = pairData ? analyzeMarketData(pairData) : null;
    const { topHolders, top10Percentage } = holderResult;

    // Creator analysis
    const creatorStatus = this.analyzeCreator(
      tokenInfo.mintAuthority, tokenInfo.freezeAuthority, topHolders, supply
    );

    // =====================================================================
    // PHASE 3: Screenshot + Creator history (parallel, both non-critical)
    // Screenshot runs for ALL tokens with a real website URL — no skipping.
    // Pump.fun tokens can use scam templates too; Vision is Veritas's edge.
    // =====================================================================
    const websiteUrl = socials?.website;
    // Only attempt screenshot for real website URLs — skip social/search redirects
    const isRealWebsite =
      !!websiteUrl &&
      !websiteUrl.includes("x.com") &&
      !websiteUrl.includes("twitter.com") &&
      !websiteUrl.includes("t.me") &&
      !websiteUrl.includes("telegram.me");

    const [websiteScreenshot, creatorHistory] = await Promise.all([
      isRealWebsite
        ? fetchScreenshotAsBase64(
            getMicrolinkUrl(websiteUrl!, true),
            { saveToDisk: process.env.VERITAS_SAVE_SCREENSHOTS === "true", prefix: "website" }
          ).catch(() => null)
        : Promise.resolve(null),
      getCreatorHistory(creatorStatus.creatorAddress).catch(() => [] as any[]),
    ]);

    if (!websiteUrl) console.log("[Veritas] 🌐 No website found — visual analysis skipped");
    else if (!isRealWebsite) console.log("[Veritas] 🌐 Website is a social/redirect URL — screenshot skipped");
    else console.log(`[Veritas] 📸 Capturing screenshot: ${websiteUrl}`);

    // =====================================================================
    // PHASE 4: AI ANALYSIS
    // =====================================================================
    console.log("[Veritas] 🤖 Running AI analysis...");

    const tokenName = socials?.name || "SPL Token";
    const tokenSymbol = socials?.symbol || "TOKEN";

    const analysisInput: UnifiedAnalysisInput = {
      tokenName,
      tokenSymbol,
      tokenAddress,
      mintAuth: tokenInfo.mintAuthority,
      freezeAuth: tokenInfo.freezeAuthority,
      top10Percentage,
      creatorPercentage: creatorStatus.creatorPercentage,
      isDumped: creatorStatus.isDumped,
      isWhale: creatorStatus.isWhale,
      websiteUrl,
      marketData: marketData ? {
        liquidity: marketData.liquidity,
        volume24h: marketData.volume24h,
        marketCap: marketData.marketCap,
        buySellRatio: marketData.buySellRatio,
        ageInHours: marketData.ageInHours,
      } : undefined,
      websiteScreenshot: websiteScreenshot || undefined,
      isPumpFun,
    };

    const aiResult = await runUnifiedAnalysis(analysisInput);

    if (!aiResult) {
      throw new Error("AI analysis failed");
    }

    // =====================================================================
    // TRUST SCORE: Deterministic + RugCheck + AI Ceiling
    // =====================================================================
    const deterministicScore = this.computeTrustScore(
      tokenInfo.mintAuthority,
      tokenInfo.freezeAuthority,
      top10Percentage,
      marketData,
      creatorStatus,
      rugCheckReport,
      marketData?.ageInHours ?? 0,
    );

    // AI can only pull DOWN, never inflate
    let finalScore = Math.min(deterministicScore, aiResult.trustScore);

    // SCAM TEMPLATE NUKE:
    // Only fires when we have an actual screenshot — never on hallucinated vision output.
    // If Gemini confirms VISUAL ASSET REUSE and the context is NOT recognizable meme culture
    // (e.g. Wojak/Pepe/Doge are whitelisted — that's normal), hard-cap the score to 50.
    if (
      websiteScreenshot &&
      aiResult.visualAnalysis &&
      /VISUAL ASSET REUSE:\s*YES/i.test(aiResult.visualAnalysis) &&
      !/meme culture|meme aesthetic|thematic|standard for|pepe|wojak|doge|iconic meme|cultural|tribute|community meme/i.test(
        aiResult.visualAnalysis
      ) &&
      finalScore > 50
    ) {
      console.log(`[Veritas] 🚨 Scam Template Nuke: ${finalScore} → 50 (non-meme asset reuse confirmed)`);
      finalScore = 50;
    }

    const finalVerdict: "Safe" | "Caution" | "Danger" =
      finalScore >= 70 ? "Safe" : finalScore >= 40 ? "Caution" : "Danger";

    console.log(
      `[Veritas] 🎯 Deterministic: ${deterministicScore} | AI: ${aiResult.trustScore} | Final: ${finalScore} (${finalVerdict})`
    );

    // =====================================================================
    // PHASE 5: FLAG SCAMMERS
    // =====================================================================
    if (creatorAddress && finalVerdict === "Danger") {
      await flagScammer(creatorAddress, tokenAddress, tokenName, finalVerdict, aiResult.summary);
      console.log("[Veritas] 🐘 Scammer flagged");
    }

    // =====================================================================
    // BUILD RESULT
    // =====================================================================
    const elapsed = Date.now() - this.startTime;
    console.log(`[Veritas] ✅ Done in ${elapsed}ms`);

    // =====================================================================
    // COMPOSE VISUAL FORENSICS FIELDS
    // =====================================================================
    const visualTrust = websiteScreenshot && aiResult.visualAnalysis && aiResult.visualAnalysis.trim() !== "";
    const rawVisual = visualTrust ? aiResult.visualAnalysis : null;

    const visualEvidenceStatus: "captured" | "not_captured" = visualTrust ? "captured" : "not_captured";

    const hasReuseYes = rawVisual ? /VISUAL ASSET REUSE:\s*YES/i.test(rawVisual) : false;
    const hasReuseNo  = rawVisual ? /VISUAL ASSET REUSE:\s*NO/i.test(rawVisual) : false;
    const visualAssetReuse: "YES" | "NO" | "UNKNOWN" = hasReuseYes ? "YES" : hasReuseNo ? "NO" : "UNKNOWN";

    const visualEvidenceSummary = rawVisual
      ? hasReuseYes
        ? `⚠️ VISUAL ASSET REUSE DETECTED. ${rawVisual.replace(/.*VISUAL ASSET REUSE:\s*YES\.?\s*/i, "").slice(0, 120)}`
        : `✅ ORIGINAL ASSETS. ${rawVisual.replace(/.*VISUAL ASSET REUSE:\s*NO\.?\s*/i, "").slice(0, 120)}`
      : !websiteUrl
      ? "No website — visual forensics not applicable."
      : !isRealWebsite
      ? "Social/redirect URL — no screenshot captured."
      : "Screenshot failed — visual forensics unavailable.";

    const visualAnalysisFinal = rawVisual
      ? rawVisual
      : !websiteUrl
      ? "No website found. Visual analysis could not be performed."
      : !isRealWebsite
      ? `Website URL appears to be a social media or redirect link (${websiteUrl}). No screenshot was captured for visual analysis.`
      : "Screenshot capture failed. Visual analysis could not be performed.";

    // veritasSays: THE complete display block for Context Protocol.
    // Contains everything the formatting AI needs — degen voice, visual forensics,
    // key metrics, socials. By being comprehensive, the formatting AI has no reason
    // to compose its own narrative from other fields.
    const ageHours = marketData?.ageInHours ?? 0;
    const ageDisplay = ageHours >= 48
      ? `${Math.floor(ageHours / 24)} days`
      : ageHours >= 1 ? `${Math.floor(ageHours)}h` : "<1h";
    const fmt = (n: number | undefined) => {
      if (!n) return "N/A";
      if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
      if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
      return `$${n.toFixed(0)}`;
    };
    const socialsLine = [
      socials?.website,
      socials?.telegram ? `TG: ${socials.telegram}` : null,
      socials?.twitter ? `X: ${socials.twitter}` : null,
    ].filter(Boolean).join(" | ");

    const veritasSays = [
      `🔍 VERITAS FORENSIC REPORT: ${tokenName} ($${tokenSymbol})`,
      `Trust Score: ${finalScore}/100 — ${finalVerdict}`,
      `Profile: ${aiResult.criminalProfile}`,
      ``,
      aiResult.degenComment,
      ``,
      `👁 VISUAL FORENSICS: ${visualEvidenceSummary}`,
      ``,
      `📊 KEY DATA:`,
      `• Market Cap: ${fmt(marketData?.marketCap)} | Liquidity: ${fmt(marketData?.liquidity)} | 24h Volume: ${fmt(marketData?.volume24h)}`,
      `• Top 10 Holders: ${top10Percentage.toFixed(1)}% | Creator: ${creatorStatus.creatorPercentage.toFixed(1)}%${creatorStatus.isDumped ? " (Dumped)" : ""}`,
      `• Contract: Mint ${tokenInfo.mintAuthority ? "⚠️ Enabled" : "✅ Disabled"} | Freeze ${tokenInfo.freezeAuthority ? "⚠️ Enabled" : "✅ Disabled"}`,
      rugCheckReport ? `• RugCheck: ${rugCheckReport.score}/100` : null,
      marketData ? `• Age: ${ageDisplay}` : null,
      socialsLine ? `\n🔗 ${socialsLine}` : null,
    ].filter(x => x !== null).join("\n");

    const finalResult: InvestigationResult = {
      trustScore: finalScore,
      verdict: finalVerdict,
      summary: aiResult.summary,
      criminalProfile: aiResult.criminalProfile,
      lies: aiResult.lies,
      evidence: aiResult.evidence,
      analysis: aiResult.analysis,
      visualAnalysis: visualAnalysisFinal,
      visualEvidenceStatus,
      visualAssetReuse,
      visualEvidenceSummary,
      veritasSays,
      degenComment: aiResult.degenComment,
      thoughtSummary: aiResult.thoughtSummary,
      tokenAddress,
      tokenName,
      tokenSymbol,
      onChain: {
        mintAuth: tokenInfo.mintAuthority,
        freezeAuth: tokenInfo.freezeAuthority,
        supply,
        decimals,
        top10Percentage,
        creatorPercentage: creatorStatus.creatorPercentage,
        isDumped: creatorStatus.isDumped,
        isWhale: creatorStatus.isWhale,
      },
      market: marketData ? {
        liquidity: marketData.liquidity,
        volume24h: marketData.volume24h,
        marketCap: marketData.marketCap,
        buySellRatio: marketData.buySellRatio,
        ageInHours: marketData.ageInHours,
        botActivity: marketData.botActivity,
        anomalies: marketData.anomalies,
      } : null,
      rugCheck: rugCheckReport ? {
        score: rugCheckReport.score,
        risks: rugCheckReport.risks,
      } : null,
      creatorHistory: {
        creatorAddress: creatorStatus.creatorAddress,
        previousTokens: creatorHistory.length,
        isSerialLauncher: creatorHistory.length >= 2,
      },
      socials: {
        website: socials?.website,
        twitter: socials?.twitter,
        telegram: socials?.telegram,
        discord: socials?.discord,
      },
      elephantMemory: {
        isKnownScammer: false,
      },
      analyzedAt: new Date().toISOString(),
      analysisTimeMs: elapsed,
    };

    // Cache for 5 min
    resultCache.set(cacheKey, finalResult);

    return finalResult;
  }

  // ===========================================================================
  // TRUST SCORE v3 — 8+ factors, RugCheck merged, capped at 88
  // ===========================================================================

  private computeTrustScore(
    mintAuth: string | null,
    freezeAuth: string | null,
    top10Percentage: number,
    marketData: { liquidity: number; marketCap: number } | null,
    creatorStatus: { isDumped: boolean; isWhale: boolean; creatorPercentage: number },
    rugCheck: RugCheckReport | null,
    ageInHours: number,
  ): number {
    let score = 100;

    // On-chain security
    if (mintAuth) score -= 40;
    if (freezeAuth) score -= 40;

    // Holder concentration
    if (top10Percentage > 50) score -= 15;
    else if (top10Percentage > 30) score -= 10;

    // Creator behavior
    if (creatorStatus.isDumped) score -= 15;
    if (creatorStatus.isWhale) score -= 10;

    // Liquidity
    if (marketData) {
      if (marketData.liquidity < 5000) score -= 20;
      else if (marketData.marketCap > 0) {
        const liqRatio = marketData.liquidity / marketData.marketCap;
        if (liqRatio < 0.02) score -= 15;
      }
    }

    // Token age (brand new = higher risk)
    if (ageInHours < 1) score -= 10;

    // RugCheck risk (merged in, not shown separately)
    if (rugCheck) {
      if (rugCheck.score > 500) score -= 20;
      else if (rugCheck.score > 200) score -= 10;
    }

    // Meme-safe cap
    return Math.min(88, Math.max(0, score));
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  private isValidPublicKey(address: string): boolean {
    try { new PublicKey(address); return true; } catch { return false; }
  }

  private async getTokenInfo(mintAddress: PublicKey) {
    const accountInfo = await connection.getParsedAccountInfo(mintAddress);
    if (!accountInfo.value) throw new Error("Token not found on Solana — check the address");
    const data = accountInfo.value.data;
    if (typeof data === "object" && "parsed" in data) return (data as any).parsed.info;
    throw new Error("Not an SPL token — only Solana SPL tokens are supported");
  }

  private async getHolderDistribution(mintAddress: PublicKey, supply: number, decimals: number) {
    try {
      const accounts = await connection.getTokenLargestAccounts(mintAddress);
      const tokenAccounts = accounts.value.slice(0, 10);
      const ownerByTokenAccount = new Map<string, string | null>();
      const denylist = new Set(
        (process.env.VERITAS_LP_OWNER_DENYLIST || "").split(",").map(s => s.trim()).filter(Boolean)
      );
      const allowlist = new Set(
        (process.env.VERITAS_LP_OWNER_ALLOWLIST || "").split(",").map(s => s.trim()).filter(Boolean)
      );

      await Promise.all(
        tokenAccounts.map(async (acc) => {
          try {
            const info = await connection.getParsedAccountInfo(acc.address);
            const data = info.value?.data;
            const owner = typeof data === "object" && data && "parsed" in data
              ? (data as any).parsed?.info?.owner ?? null : null;
            ownerByTokenAccount.set(acc.address.toString(), owner);
          } catch { ownerByTokenAccount.set(acc.address.toString(), null); }
        })
      );

      const isLikelyLpOwner = (owner: string | null) => {
        if (!owner) return false;
        if (allowlist.has(owner)) return false;
        if (denylist.has(owner)) return true;
        try {
          const ownerKey = new PublicKey(owner);
          if (!PublicKey.isOnCurve(ownerKey.toBytes())) return true;
        } catch { return false; }
        return false;
      };

      const topHoldersAll = tokenAccounts.map((acc) => {
        const balance = Number(acc.amount) / Math.pow(10, decimals);
        return { address: acc.address.toString(), balance, percentage: (balance / supply) * 100 };
      });

      const filtered = topHoldersAll.filter((h) => {
        const owner = ownerByTokenAccount.get(h.address) ?? null;
        return !isLikelyLpOwner(owner);
      });

      const topHolders = filtered.length > 0 ? filtered : topHoldersAll;
      const top10Percentage = topHolders.reduce((sum, h) => sum + h.percentage, 0);
      return { topHolders, top10Percentage };
    } catch {
      return { topHolders: [], top10Percentage: 0 };
    }
  }

  private analyzeCreator(
    mintAuth: string | null,
    freezeAuth: string | null,
    topHolders: { address: string; balance: number; percentage: number }[],
    supply: number
  ) {
    const creatorAddress = mintAuth || freezeAuth || "Unknown";
    let creatorPercentage = 0;
    if (creatorAddress !== "Unknown") {
      const holding = topHolders.find(h => h.address === creatorAddress);
      if (holding) creatorPercentage = holding.percentage;
    }
    const isDumped = creatorAddress !== "Unknown" && creatorPercentage < 1 && supply > 0;
    const isWhale = creatorPercentage > 20;
    return { creatorAddress, creatorPercentage, isDumped, isWhale };
  }

  private buildKnownScammerResult(
    tokenAddress: string, tokenInfo: any, creatorAddress: string,
    knownScammer: ScammerRecord, elapsed: number
  ): InvestigationResult {
    const decimals = tokenInfo.decimals || 0;
    const supply = Number(tokenInfo.supply) / Math.pow(10, decimals);
    return {
      trustScore: 0,
      verdict: "Danger",
      summary: `KNOWN SCAMMER. Wallet flagged on ${knownScammer.flaggedAt.toISOString().split('T')[0]}. ${knownScammer.scanCount}th detected token. DO NOT INTERACT.`,
      criminalProfile: "The Repeat Offender",
      lies: [`Creator ${creatorAddress.slice(0, 8)}... is a known scammer`],
      evidence: [
        `Previous scam: ${knownScammer.tokenName || "Unknown"}`,
        `First flagged: ${knownScammer.flaggedAt.toISOString().split('T')[0]}`,
        `Detection count: ${knownScammer.scanCount}`,
      ],
      analysis: ["INSTANT BLOCK — Elephant Memory triggered"],
      visualAnalysis: "No visual analysis — known scammer fast-path.",
      visualEvidenceStatus: "not_captured",
      visualAssetReuse: "UNKNOWN",
      visualEvidenceSummary: "No visual analysis — known scammer fast-path.",
      veritasSays: [
        `🔍 VERITAS FORENSIC REPORT: ${knownScammer.tokenName || "Unknown Token"} ($SCAM)`,
        `Trust Score: 0/100 — Danger`,
        `Profile: The Repeat Offender`,
        ``,
        `This dev already rugged before. ${knownScammer.scanCount}th token. RUN. 🚫`,
        ``,
        `👁 VISUAL FORENSICS: No visual analysis — known scammer fast-path.`,
        ``,
        `📊 KEY DATA:`,
        `• 🚨 KNOWN SCAMMER — Wallet flagged: ${knownScammer.flaggedAt.toISOString().split('T')[0]}`,
        `• Previous scam: ${knownScammer.tokenName || "Unknown"}`,
        `• Detection count: ${knownScammer.scanCount}`,
      ].join("\n"),
      degenComment: `This dev already rugged before. ${knownScammer.scanCount}th token. RUN. 🚫`,
      tokenAddress,
      tokenName: knownScammer.tokenName || "Unknown Token",
      tokenSymbol: "SCAM",
      onChain: {
        mintAuth: tokenInfo.mintAuthority || null,
        freezeAuth: tokenInfo.freezeAuthority || null,
        supply, decimals,
        top10Percentage: 0, creatorPercentage: 0,
        isDumped: true, isWhale: false,
      },
      market: null,
      rugCheck: null,
      creatorHistory: {
        creatorAddress,
        previousTokens: knownScammer.scanCount,
        isSerialLauncher: true,
      },
      socials: {},
      elephantMemory: { isKnownScammer: true, previousFlags: knownScammer },
      analyzedAt: new Date().toISOString(),
      analysisTimeMs: elapsed,
    };
  }
}
