/**
 * Market Analysis — Bot Detection & Anomaly Scanner
 * No longer fetches from DexScreener (uses pre-fetched pair data from dexscreener.ts)
 */

import type { DexScreenerPairData } from "./dexscreener";

export type BotActivityLevel = "Low" | "Medium" | "High";

export interface MarketAnalysis {
  liquidity: number;
  marketCap: number;
  volume24h: number;
  buys24h: number;
  sells24h: number;
  priceChange24h: number;
  pairCreatedAt: number;
  ageInHours: number;
  liquidityRatio: number;
  buySellRatio: number;
  washTradeScore: number;
  botActivity: BotActivityLevel;
  anomalies: string[];
}

function detectBotActivity(
  liquidityRatio: number,
  buySellRatio: number,
  washTradeScore: number
): { level: BotActivityLevel; anomalies: string[] } {
  const anomalies: string[] = [];
  let riskPoints = 0;

  if (liquidityRatio < 1) {
    anomalies.push("Liquidity < 1% of market cap");
    riskPoints += 3;
  } else if (liquidityRatio < 5) {
    anomalies.push("Low liquidity: " + liquidityRatio.toFixed(1) + "% of mcap");
    riskPoints += 1;
  }

  if (buySellRatio > 20) {
    anomalies.push("Honeypot risk: buy/sell " + buySellRatio.toFixed(0) + ":1");
    riskPoints += 3;
  } else if (buySellRatio > 10) {
    anomalies.push("Abnormal trading: buy/sell " + buySellRatio.toFixed(1) + ":1");
    riskPoints += 2;
  }

  if (washTradeScore > 100) {
    anomalies.push("Fake volume: " + washTradeScore.toFixed(0) + "x liquidity");
    riskPoints += 3;
  } else if (washTradeScore > 50) {
    anomalies.push("Suspicious volume: " + washTradeScore.toFixed(0) + "x liquidity");
    riskPoints += 2;
  }

  const level: BotActivityLevel =
    riskPoints >= 5 ? "High" : riskPoints >= 2 ? "Medium" : "Low";

  return { level, anomalies };
}

/**
 * Analyze market data from pre-fetched DexScreener pair data (no API call)
 */
export function analyzeMarketData(pairData: DexScreenerPairData): MarketAnalysis {
  const { liquidity, marketCap, volume24h, buys24h, sells24h, priceChange24h, pairCreatedAt, ageInHours } = pairData;

  const liquidityRatio = marketCap > 0 ? (liquidity / marketCap) * 100 : 0;
  const buySellRatio = sells24h > 0 ? buys24h / sells24h : buys24h;
  const washTradeScore = liquidity > 0 ? volume24h / liquidity : 0;

  const { level: botActivity, anomalies } = detectBotActivity(
    liquidityRatio,
    buySellRatio,
    washTradeScore
  );

  console.log(`[Market] Bot: ${botActivity} | Age: ${ageInHours.toFixed(0)}h | Flags: ${anomalies.length}`);

  return {
    liquidity,
    marketCap,
    volume24h,
    buys24h,
    sells24h,
    priceChange24h,
    pairCreatedAt,
    ageInHours,
    liquidityRatio,
    buySellRatio,
    washTradeScore,
    botActivity,
    anomalies,
  };
}

// Legacy compat — kept for anything that still calls with token address
export async function getMarketAnalysis(tokenAddress: string): Promise<MarketAnalysis | null> {
  // Import dynamically to avoid circular deps
  const { fetchDexScreenerData } = await import("./dexscreener");
  const result = await fetchDexScreenerData(tokenAddress);
  if (!result.pairData) return null;
  return analyzeMarketData(result.pairData);
}
