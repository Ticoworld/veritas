/**
 * VERITAS FAST API — Shadow Route
 *
 * POST /api/analyze-fast
 *
 * Returns on-chain + market data only in <2 seconds.
 * Does NOT call Gemini, screenshots, or any AI — those live exclusively in
 * the MCP-protected /api/analyze-unified route.
 *
 * CRITICAL: /api/analyze-unified is an active MCP tool staked on Context
 * Protocol. It must NEVER be modified. This shadow route is purely additive.
 *
 * Rate-limit protection: Both this route and /api/analyze-unified share the
 * same underlying fetchDexScreenerData + fetchRugCheck functions, which now
 * carry a 30-second in-memory deduplication cache. The first caller populates
 * the cache; the second caller (fired milliseconds later) gets a free hit.
 */

import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { connection } from "@/lib/solana";
import { fetchDexScreenerData } from "@/lib/api/dexscreener";
import { analyzeMarketData } from "@/lib/api/market";
import { fetchRugCheck, type RugCheckReport } from "@/lib/api/rugcheck";
import { checkKnownScammer } from "@/lib/db/elephant";
import { getCreatorHistory } from "@/lib/api/historian";
import { checkRateLimit, RateLimitExceededError } from "@/lib/security/RateLimiter";
import type { FastResult } from "@/types";

// =============================================================================
// ON-CHAIN HELPERS (private copies from VeritasInvestigator — not touching it)
// =============================================================================

async function _getTokenInfo(mintAddress: PublicKey) {
  const accountInfo = await connection.getParsedAccountInfo(mintAddress);
  if (!accountInfo.value) throw new Error("Token not found on Solana — check the address");
  const data = accountInfo.value.data;
  if (typeof data === "object" && "parsed" in data) return (data as any).parsed.info;
  throw new Error("Not an SPL token — only Solana SPL tokens are supported");
}

async function _getHolderDistribution(mintAddress: PublicKey, supply: number, decimals: number) {
  try {
    const accounts = await connection.getTokenLargestAccounts(mintAddress);
    const tokenAccounts = accounts.value.slice(0, 10);
    const ownerByTokenAccount = new Map<string, string | null>();

    const denylist = new Set(
      (process.env.VERITAS_LP_OWNER_DENYLIST || "").split(",").map((s) => s.trim()).filter(Boolean)
    );
    const allowlist = new Set(
      (process.env.VERITAS_LP_OWNER_ALLOWLIST || "").split(",").map((s) => s.trim()).filter(Boolean)
    );

    await Promise.all(
      tokenAccounts.map(async (acc) => {
        try {
          const info = await connection.getParsedAccountInfo(acc.address);
          const d = info.value?.data;
          const owner =
            typeof d === "object" && d && "parsed" in d
              ? (d as any).parsed?.info?.owner ?? null
              : null;
          ownerByTokenAccount.set(acc.address.toString(), owner);
        } catch {
          ownerByTokenAccount.set(acc.address.toString(), null);
        }
      })
    );

    const isLikelyLpOwner = (owner: string | null) => {
      if (!owner) return false;
      if (allowlist.has(owner)) return false;
      if (denylist.has(owner)) return true;
      try {
        const ownerKey = new PublicKey(owner);
        if (!PublicKey.isOnCurve(ownerKey.toBytes())) return true;
      } catch {
        return false;
      }
      return false;
    };

    const allHolders = tokenAccounts.map((acc) => {
      const balance = Number(acc.amount) / Math.pow(10, decimals);
      return { address: acc.address.toString(), balance, percentage: (balance / supply) * 100 };
    });

    const filtered = allHolders.filter((h) => !isLikelyLpOwner(ownerByTokenAccount.get(h.address) ?? null));
    const topHolders = filtered.length > 0 ? filtered : allHolders;
    const top10Percentage = topHolders.reduce((sum, h) => sum + h.percentage, 0);
    return { topHolders, top10Percentage };
  } catch {
    return { topHolders: [], top10Percentage: 0 };
  }
}

function _analyzeCreator(
  mintAuth: string | null,
  freezeAuth: string | null,
  topHolders: { address: string; balance: number; percentage: number }[],
) {
  const creatorAddress = mintAuth || freezeAuth || "Unknown";
  let creatorPercentage = 0;
  if (creatorAddress !== "Unknown") {
    const holding = topHolders.find((h) => h.address === creatorAddress);
    if (holding) creatorPercentage = holding.percentage;
  }
  const isDumped = creatorAddress !== "Unknown" && creatorPercentage < 1;
  const isWhale = creatorPercentage > 20;
  return { creatorAddress, creatorPercentage, isDumped, isWhale };
}

function _computeDeterministicScore(
  mintAuth: string | null,
  freezeAuth: string | null,
  top10Percentage: number,
  marketData: { liquidity: number; marketCap: number } | null,
  creatorStatus: { isDumped: boolean; isWhale: boolean; creatorPercentage: number },
  rugCheck: RugCheckReport | null,
  ageInHours: number,
): number {
  let score = 100;
  if (mintAuth) score -= 40;
  if (freezeAuth) score -= 40;
  if (top10Percentage > 50) score -= 15;
  else if (top10Percentage > 30) score -= 10;
  if (creatorStatus.isDumped) score -= 15;
  if (creatorStatus.isWhale) score -= 10;
  if (marketData) {
    if (marketData.liquidity < 5000) score -= 20;
    else if (marketData.marketCap > 0) {
      const liqRatio = marketData.liquidity / marketData.marketCap;
      if (liqRatio < 0.02) score -= 15;
    }
  }
  if (ageInHours < 1) score -= 10;
  if (rugCheck) {
    if (rugCheck.score > 500) score -= 20;
    else if (rugCheck.score > 200) score -= 10;
  }
  return Math.min(88, Math.max(0, score));
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const real = request.headers.get("x-real-ip");
  return forwarded?.split(",")[0]?.trim() || real || "unknown";
}

// =============================================================================
// ROUTE HANDLER
// =============================================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Rate limit (shared bouncer — same IP pool as unified route)
    const ip = getClientIp(request);
    checkRateLimit(ip);

    const body = await request.json();
    const { address } = body;

    if (!address || typeof address !== "string") {
      return NextResponse.json(
        { success: false, error: "Token address is required" },
        { status: 400 }
      );
    }

    console.log(`[Fast API] ⚡ Fast scan for ${address.slice(0, 8)}...`);

    // Validate Solana address
    let mintAddress: PublicKey;
    try {
      mintAddress = new PublicKey(address.trim());
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid Solana address format" },
        { status: 400 }
      );
    }

    // =========================================================================
    // PHASE 1: Token info (must be first — we need decimals + supply for holders)
    // =========================================================================
    const tokenInfo = await _getTokenInfo(mintAddress);
    const decimals = tokenInfo.decimals || 0;
    const supply = Number(tokenInfo.supply) / Math.pow(10, decimals);
    const creatorWallet = tokenInfo.mintAuthority || tokenInfo.freezeAuthority;

    // =========================================================================
    // PHASE 2: All fast fetches in parallel
    // DexScreener + RugCheck are cache-deduplicated — the unified route hitting
    // 5ms later gets a free cache hit, zero extra API calls fired.
    // =========================================================================
    const [dexResult, rugCheckReport, holderResult, elephantResult, creatorHistoryRaw] =
      await Promise.all([
        fetchDexScreenerData(address),
        fetchRugCheck(address),
        _getHolderDistribution(mintAddress, supply, decimals),
        creatorWallet ? checkKnownScammer(creatorWallet) : Promise.resolve(null),
        creatorWallet
          ? getCreatorHistory(creatorWallet).catch(() => [] as any[])
          : Promise.resolve([]),
      ]);

    const { socials, pairData } = dexResult;
    const marketData = pairData ? analyzeMarketData(pairData) : null;
    const { topHolders, top10Percentage } = holderResult;
    const creatorStatus = _analyzeCreator(tokenInfo.mintAuthority, tokenInfo.freezeAuthority, topHolders);

    const deterministicScore = _computeDeterministicScore(
      tokenInfo.mintAuthority,
      tokenInfo.freezeAuthority,
      top10Percentage,
      marketData,
      creatorStatus,
      rugCheckReport,
      marketData?.ageInHours ?? 0,
    );

    const elapsed = Date.now() - startTime;
    console.log(`[Fast API] ✅ Done in ${elapsed}ms | Score: ${deterministicScore}`);

    const result: FastResult = {
      tokenAddress: address,
      tokenName: socials?.name || "SPL Token",
      tokenSymbol: socials?.symbol || "TOKEN",
      deterministicScore,
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
      market: marketData
        ? {
            liquidity: marketData.liquidity,
            volume24h: marketData.volume24h,
            marketCap: marketData.marketCap,
            buySellRatio: marketData.buySellRatio,
            ageInHours: marketData.ageInHours,
            botActivity: marketData.botActivity,
            anomalies: marketData.anomalies,
          }
        : null,
      rugCheck: rugCheckReport
        ? { score: rugCheckReport.score, risks: rugCheckReport.risks }
        : null,
      socials: {
        website: socials?.website,
        twitter: socials?.twitter,
        telegram: socials?.telegram,
        discord: socials?.discord,
      },
      elephantMemory: { isKnownScammer: !!elephantResult },
      creatorHistory: {
        creatorAddress: creatorStatus.creatorAddress,
        previousTokens: creatorHistoryRaw.length,
        isSerialLauncher: creatorHistoryRaw.length >= 2,
      },
      analyzedAt: new Date().toISOString(),
      analysisTimeMs: elapsed,
    };

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } }
      );
    }

    console.error("[Fast API] ❌ Error:", error);
    const message = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
