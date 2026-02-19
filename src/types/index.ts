/**
 * Veritas Type Definitions
 * TypeScript interfaces for the Pump.fun token scanner
 */

/**
 * Represents raw token data fetched from APIs
 */
export interface TokenData {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: number;
  creatorAddress: string;
  createdAt: Date;
  imageUrl?: string;
  description?: string;
}

/**
 * Bonding curve status for a Pump.fun token
 */
export interface BondingCurveStatus {
  isComplete: boolean;
  progress: number; // 0-100 percentage
  virtualSolReserves: number;
  virtualTokenReserves: number;
  realSolReserves: number;
  realTokenReserves: number;
}

/**
 * Creator wallet analysis data
 */
export interface CreatorWalletAnalysis {
  address: string;
  totalTokensCreated: number;
  rugPullCount: number;
  successfulTokens: number;
  avgHoldTime: number; // in seconds
  totalSolExtracted: number;
  firstActivityDate: Date;
  riskScore: number; // 0-100, higher = more risky
}

/**
 * Token social links
 */
export interface TokenSocials {
  name?: string;
  symbol?: string;
  imageUrl?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
}

/**
 * Creator status for dev dump detection
 */
export interface CreatorStatus {
  creatorAddress: string;
  creatorBalance: number;
  creatorPercentage: number;
  isDumped: boolean;  // Creator holds < 1% of supply
  isWhale: boolean;   // Creator holds > 20% of supply
}

/**
 * Risk level classification
 */
export type RiskLevel = "safe" | "low" | "medium" | "high" | "critical";

/**
 * Individual risk factor identified during audit
 */
export interface RiskFactor {
  id: string;
  name: string;
  description: string;
  severity: RiskLevel;
  weight: number; // Impact on overall score
}

/**
 * Complete audit result for a token
 */
export interface AuditResult {
  tokenAddress: string;
  tokenData: TokenData;
  bondingCurve: BondingCurveStatus;
  creatorAnalysis: CreatorWalletAnalysis;
  creatorStatus: CreatorStatus;
  socials?: TokenSocials; // Added social links
  visualAnalysis?: string; // What Gemini saw in the website screenshot
  websiteText?: string; // Scraped text from the website
  creatorHistory?: { tokenName: string; mint: string; date: string }[]; // The Historian data
  marketAnalysis?: { // The Market Watcher data
    liquidity: number;
    marketCap: number;
    volume24h: number;
    buys24h: number;
    sells24h: number;
    priceChange24h: number;
    liquidityRatio: number;
    buySellRatio: number;
    washTradeScore: number;
    botActivity: "Low" | "Medium" | "High";
    anomalies: string[];
  };
  overallRiskLevel: RiskLevel;
  riskScore: number; // 0-100, higher = more risky
  riskFactors: RiskFactor[];
  auditedAt: Date;
  recommendations: string[];
}

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
}

/**
 * Holder distribution data
 */
export interface HolderData {
  address: string;
  balance: number;
  percentage: number;
  isCreator: boolean;
  isContract: boolean;
}

/**
 * Transaction history item
 */
export interface TransactionItem {
  signature: string;
  type: "buy" | "sell" | "transfer" | "create";
  amount: number;
  solAmount: number;
  from: string;
  to: string;
  timestamp: Date;
}

/**
 * Watchtower queue item for tiered processing
 * Radar (Lite Scan) + Sniper (Deep Scan) architecture
 */
export interface WatchtowerQueueItem {
  address: string;
  name: string;
  symbol: string;
  imageUrl?: string;
  // Lite Scan Data (Instant from DexScreener)
  liquidity: number;
  volume: number;
  marketCap: number;
  liquidityRatio: number; // liq / fdv - lower = sketchier
  priceChange: number;
  // Status
  status: 'queued' | 'analyzing' | 'complete';
  addedAt: number;
  scannedAt?: number;
  // Deep Scan Results (Gemini)
  riskScore?: number;
  verdict?: 'Safe' | 'Caution' | 'Danger';
}

// =============================================================================
// PROGRESSIVE RENDERING TYPES — Dual-Fetch Architecture
// =============================================================================

/**
 * Fast result from /api/analyze-fast — on-chain + market data only, no AI.
 * Returns in <2s. Subset of ScanResult.
 */
export interface FastResult {
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  deterministicScore: number;
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
    risks: Array<{ name: string; description: string; level: string; score: number }>;
  } | null;
  socials: { website?: string; twitter?: string; telegram?: string; discord?: string };
  elephantMemory: { isKnownScammer: boolean };
  creatorHistory: { creatorAddress: string; previousTokens: number; isSerialLauncher: boolean };
  analyzedAt: string;
  analysisTimeMs: number;
}

/**
 * Full scan result from /api/analyze-unified — includes AI verdict, vision, lies.
 * Returns in ~15s. Used by SlowVision component.
 */
export interface ScanResult {
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  trustScore: number;
  verdict: "Safe" | "Caution" | "Danger";
  summary: string;
  criminalProfile: string;
  lies: string[];
  evidence: string[];
  analysis: string[];
  visualAnalysis?: string;
  degenComment: string;
  thoughtSummary?: string;
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
    risks: Array<{ name: string; description: string; level: string; score: number }>;
  } | null;
  creatorHistory: { creatorAddress: string; previousTokens: number; isSerialLauncher: boolean };
  socials: { website?: string; twitter?: string; telegram?: string; discord?: string };
  elephantMemory: { isKnownScammer: boolean };
  analyzedAt: string;
  analysisTimeMs: number;
}
