/**
 * Predict Indexer API client
 * Base: https://predict-server.testnet.mystenlabs.com
 */

const BASE = "https://predict-server.testnet.mystenlabs.com";

// ─── On-chain addresses ────────────────────────────────────────────────────
export const PREDICT_ID = "0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a";
export const PREDICT_PACKAGE = "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138";
export const REGISTRY_ID = "0x43af00e6bbbd7e00614a23a2c3edfc3c22413040e0b975a7d8dd2da8b3791e64";
export const DUSDC_PACKAGE = "0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a";
export const DUSDC_TYPE = `${DUSDC_PACKAGE}::dusdc::DUSDC`;
export const DUSDC_DECIMALS = 6;
export const TICK_SIZE = 1_000_000_000n; // $1,000 in oracle units

// BTC Oracles (testnet, expires weekly Thursday 08:00 UTC)
export const BTC_ORACLES: Record<string, string> = {
  "2026-06-12": "0x195833aeee071530d2bdcd2e03916b7458d57c81ed540b82d6e1cb594bdf41f2",
  "2026-06-19": "0x1368db417891e8c7d4a083e1daa1fed3b52d33d93dfe7324e37c5e15b6b6a872",
  "2026-06-26": "0x5169649f6bf3ba756bbbef3a90a8e0da60883bbd7f0bb0fcb8acc2321ef6d63d",
  "2026-07-03": "0x5b5f283a8decb5114958639a8d5903a925507eb65c75890c09dd7e4ef7801335",
};
// Demo oracle (soonest active)
export const DEMO_ORACLE_ID = BTC_ORACLES["2026-06-19"];

export const MIN_STRIKE = 50_000_000_000_000n; // $50,000

// ─── Types ────────────────────────────────────────────────────────────────

export interface VaultSummary {
  vault_balance: string;
  available_liquidity: string;
  utilization: string;
}

export interface OraclePrice {
  spot: string;
  ask: string;
  bid: string;
}

export interface OracleInfo {
  id: string;
  expiry: string;
  status: "active" | "settled" | string;
  settlement_price: string | null;
}

export interface ManagerPosition {
  market_key: string;
  quantity: string;
}

// ─── Fetch helpers ────────────────────────────────────────────────────────

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`Predict API ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

// ─── API functions ────────────────────────────────────────────────────────

/** Live spot / ask / bid for a given oracle */
export async function getOraclePrice(oracleId: string): Promise<OraclePrice> {
  return get<OraclePrice>(`/oracles/${oracleId}/prices`);
}

/** Vault liquidity summary for the Predict pool */
export async function getVaultSummary(): Promise<VaultSummary> {
  return get<VaultSummary>(`/predicts/${PREDICT_ID}/vault/summary`);
}

/** All oracles for the Predict, filtered to active only */
export async function getActiveOracles(): Promise<OracleInfo[]> {
  const all = await get<OracleInfo[]>(`/predicts/${PREDICT_ID}/oracles`);
  return all.filter((o) => o.status === "active");
}

/** All oracles including settled */
export async function getAllOracles(): Promise<OracleInfo[]> {
  return get<OracleInfo[]>(`/predicts/${PREDICT_ID}/oracles`);
}

/** Positions held by a manager */
export async function getManagerPositions(managerId: string): Promise<ManagerPosition[]> {
  return get<ManagerPosition[]>(`/managers/${managerId}/positions`);
}

/** Manager balance */
export async function getManagerBalance(managerId: string): Promise<{ balance: string }> {
  return get<{ balance: string }>(`/managers/${managerId}`);
}

// ─── Strike computation (mirrors Move: compute_strike) ──────────────────

/**
 * Compute strike rounded down to tick_size.
 * @param spotRaw spot price in oracle units (bigint)
 * @param dropBps basis points of drop, e.g. 500 = 5%
 */
export function computeStrike(spotRaw: bigint, dropBps: bigint): bigint {
  const raw = (spotRaw * (10_000n - dropBps)) / 10_000n;
  const strike = (raw / TICK_SIZE) * TICK_SIZE;
  return strike < MIN_STRIKE ? MIN_STRIKE : strike;
}

/** Display: oracle units → USD string */
export function formatUsd(raw: bigint | string): string {
  const n = BigInt(raw);
  // oracle units: 1e9 = $1,000 → 1e12 = $1,000,000
  const dollars = n / 1_000_000_000n;
  return `$${dollars.toLocaleString()}`;
}

/** Display: DUSDC raw → human (decimals 6) */
export function formatDusdc(raw: bigint | string): string {
  const n = BigInt(raw);
  const whole = n / 1_000_000n;
  const frac = n % 1_000_000n;
  return `${whole.toLocaleString()}.${frac.toString().padStart(6, "0").replace(/0+$/, "") || "0"} DUSDC`;
}
