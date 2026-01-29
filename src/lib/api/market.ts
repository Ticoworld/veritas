/**
 * The Market Watcher - Agent 2
 * Fetches market data and detects anomalies (Wash Trading, Honeypots)
 * Uses DexScreener API for real-time market analysis
 */

import axios from "axios";

const DEXSCREENER_API = "https://api.dexscreener.com/latest/dex/tokens";

/**
 * Bot activity level based on market anomalies
 */
export type BotActivityLevel = "Low" | "Medium" | "High";

/**
 * Market analysis result with bot detection metrics
 */
export interface MarketAnalysis {
  // Raw metrics
  liquidity: number;       // USD liquidity
  marketCap: number;       // FDV in USD
  volume24h: number;       // 24h volume in USD
  buys24h: number;         // Number of buy transactions
  sells24h: number;        // Number of sell transactions
  priceChange24h: number;  // Price change percentage
  pairCreatedAt: number;   // Timestamp in ms when pair was created
  ageInHours: number;      // Token age in hours (calculated)
  
  // Calculated ratios (Bot Detector)
  liquidityRatio: number;  // liquidity / marketCap (healthy > 10%)
  buySellRatio: number;    // buys / sells (abnormal if > 10:1)
  washTradeScore: number;  // volume / liquidity (suspicious if > 50x)
  
  // Final verdict
  botActivity: BotActivityLevel;
  anomalies: string[];     // List of detected anomalies
}

/**
 * Calculate bot activity level based on market metrics
 */
function detectBotActivity(
  liquidityRatio: number,
  buySellRatio: number,
  washTradeScore: number
): { level: BotActivityLevel; anomalies: string[] } {
  const anomalies: string[] = [];
  let riskPoints = 0;

  // Liquidity Ratio Check (< 1% is very suspicious)
  if (liquidityRatio < 1) {
    anomalies.push("⚠️ Liquidity Scam Risk: Liquidity < 1% of market cap");
    riskPoints += 3;
  } else if (liquidityRatio < 5) {
    anomalies.push("⚠️ Low Liquidity: Only " + liquidityRatio.toFixed(1) + "% of market cap");
    riskPoints += 1;
  }

  // Buy/Sell Ratio Check (> 20:1 = honeypot risk)
  if (buySellRatio > 20) {
    anomalies.push("🚨 Honeypot Risk: Buy/Sell ratio is " + buySellRatio.toFixed(0) + ":1 (Cannot sell?)");
    riskPoints += 3;
  } else if (buySellRatio > 10) {
    anomalies.push("⚠️ Abnormal Trading: Buy/Sell ratio is " + buySellRatio.toFixed(1) + ":1");
    riskPoints += 2;
  }

  // Wash Trade Score Check (> 100x volume/liquidity is fake)
  if (washTradeScore > 100) {
    anomalies.push("🚨 Fake Volume: Wash trade score " + washTradeScore.toFixed(0) + "x (Bot activity!)");
    riskPoints += 3;
  } else if (washTradeScore > 50) {
    anomalies.push("⚠️ Suspicious Volume: " + washTradeScore.toFixed(0) + "x liquidity in 24h");
    riskPoints += 2;
  }

  // Determine overall bot activity level
  let level: BotActivityLevel;
  if (riskPoints >= 5) {
    level = "High";
  } else if (riskPoints >= 2) {
    level = "Medium";
  } else {
    level = "Low";
  }

  return { level, anomalies };
}

/**
 * Fetches market analysis from DexScreener and calculates bot detection metrics
 */
export async function getMarketAnalysis(tokenAddress: string): Promise<MarketAnalysis | null> {
  try {
    console.log(`[Market Watcher] 📊 Fetching market data for ${tokenAddress.slice(0, 8)}...`);
    
    const response = await axios.get(`${DEXSCREENER_API}/${tokenAddress}`, {
      timeout: 10000,
    });

    const pairs = response.data?.pairs;
    
    if (!pairs || pairs.length === 0) {
      console.log("[Market Watcher] No trading pairs found");
      return null;
    }

    // Use the most liquid pair (first one is usually the main pair)
    const mainPair = pairs[0];
    
    // Extract raw metrics
    const liquidity = mainPair.liquidity?.usd ?? 0;
    const marketCap = mainPair.fdv ?? 0;
    const volume24h = mainPair.volume?.h24 ?? 0;
    const buys24h = mainPair.txns?.h24?.buys ?? 0;
    const sells24h = mainPair.txns?.h24?.sells ?? 1; // Avoid division by zero
    const priceChange24h = mainPair.priceChange?.h24 ?? 0;

    // Calculate Bot Detector ratios
    const liquidityRatio = marketCap > 0 ? (liquidity / marketCap) * 100 : 0;
    const buySellRatio = sells24h > 0 ? buys24h / sells24h : buys24h;
    const washTradeScore = liquidity > 0 ? volume24h / liquidity : 0;

    // Detect bot activity
    const { level: botActivity, anomalies } = detectBotActivity(
      liquidityRatio,
      buySellRatio,
      washTradeScore
    );

    // Extract pair creation time for token age
    // If missing, treat as brand new (0 hours = high risk, not 24h)
    const pairCreatedAt = mainPair.pairCreatedAt ?? 0;
    let ageInHours = 0;
    if (mainPair.pairCreatedAt) {
      const rawAge = (Date.now() - mainPair.pairCreatedAt) / (1000 * 60 * 60);
      ageInHours = Math.max(0, rawAge); // Ensure non-negative (in case of future timestamps)
    }

    console.log(`[Market Watcher] 🔍 Bot Activity: ${botActivity} | Age: ${ageInHours.toFixed(0)}h | Anomalies: ${anomalies.length}`);

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
  } catch (error) {
    console.error("[Market Watcher] Failed to fetch market data:", error);
    return null;
  }
}
