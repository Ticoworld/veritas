/**
 * Solscan API Client
 * Handles fetching token and wallet data from Solscan
 */

import axios from "axios";
import type { TokenData, HolderData, TransactionItem, ApiResponse } from "@/types";

const SOLSCAN_API_BASE = "https://api.solscan.io";

/**
 * Solscan API client instance
 */
const solscanClient = axios.create({
  baseURL: SOLSCAN_API_BASE,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

/**
 * Fetches token metadata from Solscan
 */
export async function getTokenInfo(
  tokenAddress: string
): Promise<ApiResponse<TokenData>> {
  try {
    const response = await solscanClient.get(`/token/meta`, {
      params: { token: tokenAddress },
    });

    return {
      success: true,
      data: response.data,
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
 * Fetches token holder distribution
 */
export async function getTokenHolders(
  tokenAddress: string,
  limit: number = 20
): Promise<ApiResponse<HolderData[]>> {
  try {
    const response = await solscanClient.get(`/token/holders`, {
      params: { token: tokenAddress, limit },
    });

    return {
      success: true,
      data: response.data,
      timestamp: new Date(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch holders",
      timestamp: new Date(),
    };
  }
}

/**
 * Fetches wallet transaction history
 */
export async function getWalletTransactions(
  walletAddress: string,
  limit: number = 50
): Promise<ApiResponse<TransactionItem[]>> {
  try {
    const response = await solscanClient.get(`/account/transaction`, {
      params: { account: walletAddress, limit },
    });

    return {
      success: true,
      data: response.data,
      timestamp: new Date(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch transactions",
      timestamp: new Date(),
    };
  }
}

/**
 * Fetches all tokens created by a wallet
 */
export async function getWalletTokens(
  walletAddress: string
): Promise<ApiResponse<TokenData[]>> {
  try {
    const response = await solscanClient.get(`/account/tokens`, {
      params: { account: walletAddress },
    });

    return {
      success: true,
      data: response.data,
      timestamp: new Date(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch wallet tokens",
      timestamp: new Date(),
    };
  }
}
