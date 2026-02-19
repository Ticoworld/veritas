/**
 * DexScreener API Client — Single Source of Truth
 * ONE call fetches socials + market data. No duplication.
 */

import type { TokenSocials } from "@/types";

const DEXSCREENER_API = "https://api.dexscreener.com/latest/dex/tokens";

// =============================================================================
// 30-SECOND DEDUPLICATION CACHE + IN-FLIGHT PROMISE DEDUP
// Result cache: hits after first call completes (30s TTL).
// In-flight map: if two routes fire simultaneously, the second awaits the
// first’s in-flight Promise instead of making a duplicate request.
// =============================================================================
type DexCacheEntry = { data: DexScreenerResult; expiresAt: number };
const _globalDex = globalThis as unknown as {
  _dexCache?: Map<string, DexCacheEntry>;
  _dexInflight?: Map<string, Promise<DexScreenerResult>>;
};
const _dexCache = _globalDex._dexCache ??= new Map<string, DexCacheEntry>();
const _dexInflight = _globalDex._dexInflight ??= new Map<string, Promise<DexScreenerResult>>();

function _dexGet(key: string): DexScreenerResult | undefined {
  const entry = _dexCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) { _dexCache.delete(key); return undefined; }
  return entry.data;
}
function _dexSet(key: string, data: DexScreenerResult): void {
  _dexCache.set(key, { data, expiresAt: Date.now() + 30_000 });
}

// Raw pair data we pass downstream so market.ts doesn't re-fetch
export interface DexScreenerPairData {
  liquidity: number;
  marketCap: number;
  volume24h: number;
  buys24h: number;
  sells24h: number;
  priceChange24h: number;
  pairCreatedAt: number;
  ageInHours: number;
}

export interface DexScreenerResult {
  socials: TokenSocials;
  pairData: DexScreenerPairData | null;
}

/**
 * Single DexScreener fetch — returns socials + market pair data
 */
export async function fetchDexScreenerData(address: string): Promise<DexScreenerResult> {
  // 1. Result cache hit (already completed)
  const cached = _dexGet(address);
  if (cached) {
    console.log(`[DexScreener] ⚡ Cache hit for ${address.slice(0, 8)}`);
    return cached;
  }

  // 2. In-flight dedup — second simultaneous caller gets the same Promise
  const inflight = _dexInflight.get(address);
  if (inflight) {
    console.log(`[DexScreener] ⏳ Awaiting in-flight request for ${address.slice(0, 8)}`);
    return inflight;
  }

  // 3. New request — store Promise immediately before awaiting
  const promise = (async (): Promise<DexScreenerResult> => {
    try {
    console.log(`[DexScreener] 🔍 Fetching data for ${address.slice(0, 8)}...`);

    const response = await fetch(`${DEXSCREENER_API}/${address}`, {
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.warn("[DexScreener] API error:", response.status);
      const empty: DexScreenerResult = { socials: {}, pairData: null };
      _dexSet(address, empty);
      return empty;
    }

    const data = await response.json();
    const pairs = data?.pairs;

    if (!pairs || pairs.length === 0) {
      console.log("[DexScreener] No trading pairs found");
      const empty: DexScreenerResult = { socials: {}, pairData: null };
      _dexSet(address, empty);
      return empty;
    }

    const pair = pairs[0];

    // === SOCIALS ===
    const info = pair.info || {};
    const socials: TokenSocials = {};

    if (pair.baseToken) {
      socials.name = pair.baseToken.name;
      socials.symbol = pair.baseToken.symbol;
    }
    if (info.imageUrl) {
      socials.imageUrl = info.imageUrl;
    }
    if (info.websites) {
      const mainWeb = info.websites.find(
        (w: any) => w.label.toLowerCase().includes("web") || w.label.toLowerCase() === "website"
      );
      socials.website = mainWeb?.url || info.websites[0]?.url;
    }
    if (info.socials) {
      const twitter = info.socials.find((s: any) => s.type === "twitter");
      if (twitter) socials.twitter = twitter.url;
      const telegram = info.socials.find((s: any) => s.type === "telegram");
      if (telegram) socials.telegram = telegram.url;
      const discord = info.socials.find((s: any) => s.type === "discord");
      if (discord) socials.discord = discord.url;
    }

    // === MARKET PAIR DATA ===
    const liquidity = pair.liquidity?.usd ?? 0;
    const marketCap = pair.fdv ?? 0;
    const volume24h = pair.volume?.h24 ?? 0;
    const buys24h = pair.txns?.h24?.buys ?? 0;
    const sells24h = pair.txns?.h24?.sells ?? 1;
    const priceChange24h = pair.priceChange?.h24 ?? 0;
    const pairCreatedAt = pair.pairCreatedAt ?? 0;
    let ageInHours = 0;
    if (pair.pairCreatedAt) {
      ageInHours = Math.max(0, (Date.now() - pair.pairCreatedAt) / (1000 * 60 * 60));
    }

    console.log(`[DexScreener] ✅ ${socials.name || "Token"} | Liq: $${liquidity.toLocaleString()} | MCap: $${marketCap.toLocaleString()}`);

    const result: DexScreenerResult = {
      socials,
      pairData: {
        liquidity,
        marketCap,
        volume24h,
        buys24h,
        sells24h,
        priceChange24h,
        pairCreatedAt,
        ageInHours,
      },
    };

    _dexSet(address, result);
    return result;
  } catch (error) {
    console.error("[DexScreener] Error:", error);
    const empty: DexScreenerResult = { socials: {}, pairData: null };
    _dexSet(address, empty);
    return empty;
  }
  })();

  _dexInflight.set(address, promise);
  try {
    return await promise;
  } finally {
    _dexInflight.delete(address);
  }
}

// Keep backward compat for anything that still imports this
export async function getTokenSocials(address: string): Promise<TokenSocials> {
  const result = await fetchDexScreenerData(address);
  return result.socials;
}

/**
 * Search DexScreener by token ticker (e.g. "$MONBROOM" → mint address + price)
 * Uses the search endpoint, filters to Solana pairs
 */
export interface TokenSearchResult {
  mintAddress: string;
  symbol: string;
  name: string;
  priceUsd: number;
  marketCap: number;
  liquidity: number;
  pairCreatedAt: number;
}

/**
 * Resolves a potential DexScreener pair address to its base token mint address.
 * DexScreener URLs use pair addresses (LP pool), not token mints.
 * If the address is already a mint (pairs endpoint returns nothing), returns it unchanged.
 */
export async function resolveToMintAddress(address: string): Promise<string> {
  try {
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/pairs/solana/${address}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!response.ok) return address;
    const data = await response.json();
    const pairs = data?.pairs;
    if (pairs && pairs.length > 0 && pairs[0].baseToken?.address) {
      const resolved: string = pairs[0].baseToken.address;
      if (resolved !== address) {
        console.log(`[DexScreener] 🔗 Pair resolved: ${address.slice(0, 8)} → token ${resolved.slice(0, 8)}`);
      }
      return resolved;
    }
  } catch {
    // ignore — fall back to original
  }
  return address;
}

export async function searchTokenByTicker(ticker: string): Promise<TokenSearchResult | null> {
  try {
    const cleanTicker = ticker.replace(/^\$/, "").toUpperCase();
    console.log(`[DexScreener] 🔍 Searching for ticker: ${cleanTicker}`);

    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(cleanTicker)}`,
      { signal: AbortSignal.timeout(8000) }
    );

    if (!response.ok) {
      console.warn("[DexScreener] Search API error:", response.status);
      return null;
    }

    const data = await response.json();
    const pairs = data?.pairs;

    if (!pairs || pairs.length === 0) {
      console.log("[DexScreener] No results for ticker search");
      return null;
    }

    // Filter to Solana pairs, prefer highest liquidity
    const solanaPairs = pairs
      .filter((p: any) => p.chainId === "solana")
      .sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));

    if (solanaPairs.length === 0) {
      console.log("[DexScreener] No Solana pairs found");
      return null;
    }

    const best = solanaPairs[0];

    const result: TokenSearchResult = {
      mintAddress: best.baseToken.address,
      symbol: best.baseToken.symbol,
      name: best.baseToken.name,
      priceUsd: parseFloat(best.priceUsd) || 0,
      marketCap: best.fdv || 0,
      liquidity: best.liquidity?.usd || 0,
      pairCreatedAt: best.pairCreatedAt || 0,
    };

    console.log(`[DexScreener] ✅ Found: ${result.name} (${result.mintAddress.slice(0, 8)}...) | $${result.priceUsd}`);
    return result;
  } catch (error) {
    console.error("[DexScreener] Search failed:", error);
    return null;
  }
}
