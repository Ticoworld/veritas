import { Connection } from "@solana/web3.js";

/**
 * Solana Mainnet-Beta RPC endpoints
 * Using Helius as primary (most reliable)
 */
const RPC_ENDPOINTS = [
  // Helius RPC (primary - most reliable)
  "https://mainnet.helius-rpc.com/?api-key=dde414e8-a88f-4356-8fba-e40436813b71",
  // Fallbacks
  "https://rpc.ankr.com/solana",
  "https://api.mainnet-beta.solana.com",
];

/**
 * Solana connection instance for mainnet-beta
 * Configured with commitment level for reliable reads
 */
export const connection = new Connection(RPC_ENDPOINTS[0], {
  commitment: "confirmed",
  confirmTransactionInitialTimeout: 60000,
});

/**
 * Get a fresh connection (useful for retry logic)
 */
export function getConnection(endpointIndex: number = 0): Connection {
  const endpoint = RPC_ENDPOINTS[endpointIndex % RPC_ENDPOINTS.length];
  return new Connection(endpoint, {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 60000,
  });
}
