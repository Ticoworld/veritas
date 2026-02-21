import { Connection } from "@solana/web3.js";

/**
 * Solana Mainnet-Beta RPC endpoints
 * Prefer Helius when configured, then fall back to public RPCs.
 */
const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL?.trim();
const HELIUS_API_KEY = process.env.HELIUS_API_KEY?.trim();

const primaryHeliusUrl = HELIUS_RPC_URL
	? HELIUS_RPC_URL
	: HELIUS_API_KEY
	? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
	: undefined;

const RPC_ENDPOINTS = [
	...(primaryHeliusUrl ? [primaryHeliusUrl] : []),
	"https://rpc.ankr.com/solana",
	"https://api.mainnet-beta.solana.com",
];

const DEFAULT_COMMITMENT = "confirmed" as const;
const DEFAULT_TIMEOUT_MS = 60000;

/**
 * Solana connection instance for mainnet-beta
 * Configured with commitment level for reliable reads
 */
export const connection = new Connection(RPC_ENDPOINTS[0], {
	commitment: DEFAULT_COMMITMENT,
	confirmTransactionInitialTimeout: DEFAULT_TIMEOUT_MS,
});

/**
 * Get a fresh connection (useful for retry logic)
 */
export function getConnection(endpointIndex: number = 0): Connection {
	const endpoint = RPC_ENDPOINTS[endpointIndex % RPC_ENDPOINTS.length];
	return new Connection(endpoint, {
		commitment: DEFAULT_COMMITMENT,
		confirmTransactionInitialTimeout: DEFAULT_TIMEOUT_MS,
	});
}
