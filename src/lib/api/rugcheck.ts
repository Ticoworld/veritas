/**
 * RugCheck API Integration
 * Fetches on-chain security audit for SPL tokens
 * API: https://api.rugcheck.xyz/v1/tokens/{mint}/report
 */

export interface RugCheckRisk {
  name: string;
  description: string;
  level: "info" | "warn" | "danger";
  score: number;
}

export interface RugCheckReport {
  score: number; // 0-100, higher = riskier (this is a RISK score, not safety score)
  risks: RugCheckRisk[];
  creator?: string; // Deployer wallet address
  mint?: string;
  tokenMeta?: {
    name?: string;
    symbol?: string;
  };
}

const RUGCHECK_API_BASE = "https://api.rugcheck.xyz/v1/tokens";

// =============================================================================
// 30-SECOND DEDUPLICATION CACHE
// Prevents double-tap 429s when /api/analyze-fast and /api/analyze-unified
// both call fetchRugCheck within milliseconds of each other.
// Uses globalThis to survive Next.js dev hot reloads.
// =============================================================================
type RcCacheEntry = { data: RugCheckReport | null; expiresAt: number };
const _globalRc = globalThis as unknown as { _rcCache?: Map<string, RcCacheEntry> };
const _rcCache = _globalRc._rcCache ??= new Map<string, RcCacheEntry>();

function _rcGet(key: string): RugCheckReport | null | undefined {
  const entry = _rcCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) { _rcCache.delete(key); return undefined; }
  return entry.data;
}
function _rcSet(key: string, data: RugCheckReport | null): void {
  _rcCache.set(key, { data, expiresAt: Date.now() + 30_000 });
}

/**
 * Fetches token security report from RugCheck
 * 
 * @param tokenAddress - Solana token mint address
 * @returns RugCheckReport or null if unavailable
 */
export async function fetchRugCheck(tokenAddress: string): Promise<RugCheckReport | null> {
  // Deduplication cache — 30s TTL prevents dual-fetch double-tap on RugCheck API
  const cached = _rcGet(tokenAddress);
  if (cached !== undefined) {
    console.log(`[RugCheck] ⚡ Cache hit for ${tokenAddress.slice(0, 8)}`);
    return cached;
  }

  try {
    console.log(`[RugCheck] 🔍 Auditing contract: ${tokenAddress.slice(0, 8)}...`);

    // Check if API key is configured (optional but recommended)
    const apiKey = process.env.RUGCHECK_API_KEY;
    if (!apiKey) {
      console.warn("[RugCheck] No RUGCHECK_API_KEY found - using public tier (rate limited)");
    }

    const headers: Record<string, string> = {
      "Accept": "application/json",
    };
    
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${RUGCHECK_API_BASE}/${tokenAddress}/report`, {
      headers,
      signal: AbortSignal.timeout(5000), // 5s — return null quickly if slow
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log("[RugCheck] Token not found in database (too new or not indexed yet)");
        _rcSet(tokenAddress, null);
        return null;
      } else if (response.status === 429) {
        console.warn("[RugCheck] Rate limit hit - consider adding RUGCHECK_API_KEY to .env");
        return null; // Don't cache 429s — let retry flow naturally
      } else {
        console.warn(`[RugCheck] API error: ${response.status} ${response.statusText}`);
        _rcSet(tokenAddress, null);
        return null;
      }
    }

    const data = await response.json();

    // Verification: log raw keys so we can confirm what RugCheck returns (e.g. simulation, tax)
    const keys = Object.keys(data ?? {}).filter((k) => !k.startsWith("_"));
    console.log("[RugCheck] Response keys:", keys.join(", "));

    // Extract creator/deployer address from various possible fields
    const creatorAddress = 
      data.creator || 
      data.deployer || 
      data.tokenMeta?.creator || 
      data.tokenMeta?.updateAuthority ||
      null;

    // Build structured report
    const report: RugCheckReport = {
      score: data.score ?? 0,
      risks: Array.isArray(data.risks) ? data.risks.map((r: any) => ({
        name: r.name || "Unknown Risk",
        description: r.description || "",
        level: r.level || "info",
        score: r.score || 0,
      })) : [],
      creator: creatorAddress,
      mint: tokenAddress,
      tokenMeta: {
        name: data.tokenMeta?.name,
        symbol: data.tokenMeta?.symbol,
      },
    };

    console.log(
      `[RugCheck] ✅ Score: ${report.score}/100 (RISK) | ` +
      `Risks: ${report.risks.length}` +
      `${creatorAddress ? ` | Creator: ${creatorAddress.slice(0, 8)}...` : ''}`
    );

    _rcSet(tokenAddress, report);
    return report;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        console.error("[RugCheck] Request timed out after 5s — returning null");
      } else {
        console.error("[RugCheck] Failed to fetch report:", error.message);
      }
    } else {
      console.error("[RugCheck] Unknown error:", error);
    }
    _rcSet(tokenAddress, null);
    return null;
  }
}

/**
 * Helper: Check if a specific risk type exists in the report
 */
export function hasRisk(report: RugCheckReport | null, riskName: string): boolean {
  if (!report) return false;
  return report.risks.some(r => r.name.toLowerCase().includes(riskName.toLowerCase()));
}

/**
 * Helper: Get all high-severity risks
 */
export function getHighRisks(report: RugCheckReport | null): RugCheckRisk[] {
  if (!report) return [];
  return report.risks.filter(r => r.level === "danger");
}
