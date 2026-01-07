/**
 * Pump.fun API Client
 * Handles fetching bonding curve and token data from Pump.fun
 */

import axios from "axios";
import type { BondingCurveStatus, TokenData, ApiResponse } from "@/types";

const PUMPFUN_API_BASE = "https://frontend-api.pump.fun";

/**
 * Pump.fun API client instance
 */
const pumpfunClient = axios.create({
  baseURL: PUMPFUN_API_BASE,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

/**
 * Fetches bonding curve status for a token
 */
export async function getBondingCurveStatus(
  tokenAddress: string
): Promise<ApiResponse<BondingCurveStatus>> {
  try {
    const response = await pumpfunClient.get(`/coins/${tokenAddress}`);
    
    const data = response.data;
    
    // Calculate bonding curve progress
    const progress = calculateBondingProgress(
      data.virtual_sol_reserves,
      data.virtual_token_reserves
    );

    return {
      success: true,
      data: {
        isComplete: data.complete || false,
        progress,
        virtualSolReserves: data.virtual_sol_reserves || 0,
        virtualTokenReserves: data.virtual_token_reserves || 0,
        realSolReserves: data.real_sol_reserves || 0,
        realTokenReserves: data.real_token_reserves || 0,
      },
      timestamp: new Date(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch bonding curve",
      timestamp: new Date(),
    };
  }
}

/**
 * Fetches token details from Pump.fun
 */
export async function getPumpfunTokenInfo(
  tokenAddress: string
): Promise<ApiResponse<TokenData>> {
  try {
    const response = await pumpfunClient.get(`/coins/${tokenAddress}`);
    
    const data = response.data;

    return {
      success: true,
      data: {
        address: tokenAddress,
        name: data.name || "Unknown",
        symbol: data.symbol || "???",
        decimals: 6, // Pump.fun tokens use 6 decimals
        totalSupply: data.total_supply || 0,
        creatorAddress: data.creator || "",
        createdAt: new Date(data.created_timestamp || Date.now()),
        imageUrl: data.image_uri,
        description: data.description,
      },
      timestamp: new Date(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch token info",
      timestamp: new Date(),
    };
  }
}

/**
 * Fetches recently created tokens from Pump.fun
 */
export async function getRecentTokens(
  limit: number = 20
): Promise<ApiResponse<TokenData[]>> {
  try {
    const response = await pumpfunClient.get(`/coins`, {
      params: { limit, sort: "created_timestamp", order: "desc" },
    });

    return {
      success: true,
      data: response.data,
      timestamp: new Date(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch recent tokens",
      timestamp: new Date(),
    };
  }
}

/**
 * Calculates bonding curve progress percentage
 * Pump.fun bonding curve completes at ~85 SOL
 */
function calculateBondingProgress(
  virtualSolReserves: number,
  virtualTokenReserves: number
): number {
  const TARGET_SOL = 85_000_000_000; // 85 SOL in lamports
  const INITIAL_SOL = 30_000_000_000; // Initial virtual SOL (30 SOL)
  
  const currentSol = virtualSolReserves || INITIAL_SOL;
  const progress = ((currentSol - INITIAL_SOL) / (TARGET_SOL - INITIAL_SOL)) * 100;
  
  return Math.min(Math.max(progress, 0), 100);
}
