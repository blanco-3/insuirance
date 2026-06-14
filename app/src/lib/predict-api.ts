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
export const TICK_SIZE = 1_000_000_000n;
export const MIN_STRIKE = 50_000_000_000_000n; // $50,000

// ─── Types ────────────────────────────────────────────────────────────────

export interface VaultSummary {
  vault_balance: string;
  available_liquidity: string;
  utilization: number;
}

export interface OraclePrice {
  spot: string;
  forward: string;
}

/** Normalized oracle info (API field oracle_id → id) */
export interface OracleInfo {
  id: string;
  underlying_asset: string;
  expiry: number;
  status: "active" | "settled" | string;
  settlement_price: string | null;
  min_strike: number;
  tick_size: number;
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

/** Normalize raw API oracle object (oracle_id → id, numeric expiry) */
function normalizeOracle(raw: any): OracleInfo {
  return {
    id: raw.oracle_id.startsWith("0x") ? raw.oracle_id : `0x${raw.oracle_id}`,
    underlying_asset: raw.underlying_asset,
    expiry: Number(raw.expiry),
    status: raw.status,
    settlement_price: raw.settlement_price ?? null,
    min_strike: Number(raw.min_strike),
    tick_size: Number(raw.tick_size),
  };
}

// ─── API functions ────────────────────────────────────────────────────────

/** Latest spot price for a given oracle (API returns array, newest first) */
export async function getOraclePrice(oracleId: string): Promise<OraclePrice> {
  const events = await get<any[]>(`/oracles/${oracleId}/prices`);
  if (!Array.isArray(events) || events.length === 0) throw new Error("No price data");
  return { spot: String(events[0].spot), forward: String(events[0].forward) };
}

/** Vault liquidity summary */
export async function getVaultSummary(): Promise<VaultSummary> {
  return get<VaultSummary>(`/predicts/${PREDICT_ID}/vault/summary`);
}

/** Active oracles, sorted by expiry ascending */
export async function getActiveOracles(): Promise<OracleInfo[]> {
  const all = await get<any[]>(`/predicts/${PREDICT_ID}/oracles`);
  return all
    .filter((o) => o.status === "active" && Number(o.expiry) > Date.now())
    .map(normalizeOracle)
    .sort((a, b) => a.expiry - b.expiry);
}

/** All oracles including settled */
export async function getAllOracles(): Promise<OracleInfo[]> {
  const all = await get<any[]>(`/predicts/${PREDICT_ID}/oracles`);
  return all.map(normalizeOracle);
}

/** Positions held by a manager */
export async function getManagerPositions(managerId: string): Promise<ManagerPosition[]> {
  return get<ManagerPosition[]>(`/managers/${managerId}/positions`);
}

// ─── Strike computation (mirrors Move: compute_strike) ──────────────────

export function computeStrike(spotRaw: bigint, dropBps: bigint): bigint {
  const raw = (spotRaw * (10_000n - dropBps)) / 10_000n;
  const strike = (raw / TICK_SIZE) * TICK_SIZE;
  return strike < MIN_STRIKE ? MIN_STRIKE : strike;
}

/** Display: oracle units → USD string */
export function formatUsd(raw: bigint | string | number): string {
  const n = BigInt(raw);
  const dollars = n / 1_000_000_000n;
  return `$${dollars.toLocaleString()}`;
}

/** Display: DUSDC raw → human (decimals 6) */
export function formatDusdc(raw: bigint | string | number): string {
  const n = BigInt(raw);
  const whole = n / 1_000_000n;
  const frac = n % 1_000_000n;
  return `${whole.toLocaleString()}.${frac.toString().padStart(6, "0").replace(/0+$/, "") || "0"} DUSDC`;
}

/** Format expiry timestamp to readable string */
export function formatExpiry(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}
