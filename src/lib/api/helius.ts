/**
 * Helius DAS API Wrapper
 * Provides wallet and token holder analysis for Insider Intel
 */

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

if (!HELIUS_API_KEY) {
  console.warn("[Helius] No HELIUS_API_KEY found - wallet tracking features disabled");
}

export interface TokenAccount {
  address: string;
  owner: string;
  amount: string;
  decimals: number;
}

export interface WalletTransaction {
  signature: string;
  timestamp: number;
  type: string;
  tokenTransfers?: {
    mint: string;
    amount: number;
    fromUserAccount?: string;
    toUserAccount?: string;
  }[];
  nativeTransfers?: {
    fromUserAccount: string;
    toUserAccount: string;
    amount: number; // in lamports
  }[];
}

export interface Asset {
  id: string;
  content: {
    metadata: {
      name: string;
      symbol: string;
    };
  };
  token_info?: {
    balance: number;
    decimals: number;
    price_info?: {
      price_per_token: number;
    };
  };
}

/**
 * Get all token accounts (holders) for a given mint address
 * Uses pagination to fetch all holders
 */
export async function getTokenAccounts(
  mintAddress: string,
  limit: number = 1000
): Promise<TokenAccount[]> {
  if (!HELIUS_API_KEY) {
    throw new Error("Helius API key not configured");
  }

  try {
    console.log(`[Helius] Fetching token accounts for ${mintAddress.slice(0, 8)}...`);

    const response = await fetch(HELIUS_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "helius-token-accounts",
        method: "getTokenAccounts",
        params: {
          mint: mintAddress,
          limit,
          displayOptions: {},
        },
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error("[Helius] API error:", data.error);
      throw new Error(data.error.message || "Failed to fetch token accounts");
    }

    const accounts: TokenAccount[] = (data.result?.token_accounts || []).map((acc: any) => ({
      address: acc.address,
      owner: acc.owner,
      amount: acc.amount,
      decimals: acc.decimals || 9,
    }));

    console.log(`[Helius] ✅ Found ${accounts.length} holders`);
    return accounts;
  } catch (error) {
    console.error("[Helius] Failed to fetch token accounts:", error);
    throw error;
  }
}

/**
 * Get transaction history for a wallet address
 * Returns parsed transactions with token transfers
 */
export async function getSignaturesForAddress(
  walletAddress: string,
  limit: number = 100
): Promise<WalletTransaction[]> {
  if (!HELIUS_API_KEY) {
    throw new Error("Helius API key not configured");
  }

  try {
    console.log(`[Helius] Fetching transaction history for ${walletAddress.slice(0, 8)}...`);

    const response = await fetch(
      `https://api.helius.xyz/v0/addresses/${walletAddress}/transactions?api-key=${HELIUS_API_KEY}&limit=${limit}`
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const transactions = await response.json();

    const parsed: WalletTransaction[] = transactions.map((tx: any) => ({
      signature: tx.signature,
      timestamp: tx.timestamp,
      type: tx.type,
      tokenTransfers: tx.tokenTransfers?.map((transfer: any) => ({
        mint: transfer.mint,
        amount: transfer.tokenAmount || 0,
        fromUserAccount: transfer.fromUserAccount,
        toUserAccount: transfer.toUserAccount,
      })),
    }));

    console.log(`[Helius] ✅ Found ${parsed.length} transactions`);
    return parsed;
  } catch (error) {
    console.error("[Helius] Failed to fetch transactions:", error);
    throw error;
  }
}

/**
 * Get all assets (tokens) owned by a wallet
 */
export async function getAssetsByOwner(walletAddress: string): Promise<Asset[]> {
  if (!HELIUS_API_KEY) {
    throw new Error("Helius API key not configured");
  }

  try {
    console.log(`[Helius] Fetching assets for ${walletAddress.slice(0, 8)}...`);

    const response = await fetch(HELIUS_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "helius-assets",
        method: "getAssetsByOwner",
        params: {
          ownerAddress: walletAddress,
          displayOptions: {
            showFungible: true,
            showNativeBalance: true,
          },
        },
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error("[Helius] API error:", data.error);
      throw new Error(data.error.message || "Failed to fetch assets");
    }

    const assets: Asset[] = data.result?.items || [];
    console.log(`[Helius] ✅ Found ${assets.length} assets`);
    return assets;
  } catch (error) {
    console.error("[Helius] Failed to fetch assets:", error);
    throw error;
  }
}

/**
 * Get ALL transactions for a token mint address
 * This fetches every buy/sell for the token — key for PnL Hunter matching
 */
export async function getTokenTransactions(
  mintAddress: string,
  limit: number = 100
): Promise<WalletTransaction[]> {
  if (!HELIUS_API_KEY) {
    throw new Error("Helius API key not configured");
  }

  try {
    console.log(`[Helius] Fetching token transactions for ${mintAddress.slice(0, 8)}...`);

    const response = await fetch(
      `https://api.helius.xyz/v0/addresses/${mintAddress}/transactions?api-key=${HELIUS_API_KEY}&limit=${limit}`
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const transactions = await response.json();

    const parsed: WalletTransaction[] = transactions.map((tx: any) => ({
      signature: tx.signature,
      timestamp: tx.timestamp,
      type: tx.type,
      tokenTransfers: tx.tokenTransfers?.map((transfer: any) => ({
        mint: transfer.mint,
        amount: transfer.tokenAmount || 0,
        fromUserAccount: transfer.fromUserAccount,
        toUserAccount: transfer.toUserAccount,
      })),
      nativeTransfers: tx.nativeTransfers?.map((transfer: any) => ({
        fromUserAccount: transfer.fromUserAccount,
        toUserAccount: transfer.toUserAccount,
        amount: transfer.amount, // in lamports
      })),
    }));

    console.log(`[Helius] ✅ Found ${parsed.length} token transactions`);
    return parsed;
  } catch (error) {
    console.error("[Helius] Failed to fetch token transactions:", error);
    throw error;
  }
}

