/**
 * E2E test: create manager → deposit dUSDC → buy cover → verify Policy NFT
 * Uses the local Sui CLI keystore (active address).
 * Run from: /Users/blanco/insuirance/app/
 */

// Use absolute paths to the app's node_modules
const SDK = "/Users/blanco/insuirance/app/node_modules/@mysten/sui/dist";

const { CoreClient } = await import(`${SDK}/client/index.mjs`);
const { Ed25519Keypair } = await import(`${SDK}/keypairs/ed25519/index.mjs`);
const { Transaction } = await import(`${SDK}/transactions/index.mjs`);
import { readFileSync } from "fs";

// ── Config ────────────────────────────────────────────────────────────────────
const PREDICT_PACKAGE  = "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138";
const PREDICT_ID       = "0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a";
const INSUIRANCE_PKG   = "0x8559a28a9e20a65b0b7deeb66c6e8022b67290b52e1166d0c2cfca44f2bdd481";
const SHIELD_VAULT_ID  = "0xe5790d19867341dbe11e0dea0ea4be22b8d8c06d4cd3b5eda69afa78017e0f7a";
const DUSDC_PKG        = "0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a";
const DUSDC_TYPE       = `${DUSDC_PKG}::dusdc::DUSDC`;
const CLOCK_ID         = "0x6";
const PREDICT_API      = "https://predict-server.testnet.mystenlabs.com";
const SUI_RPC          = "https://fullnode.testnet.sui.io:443";

// ── Load keypair ──────────────────────────────────────────────────────────────
const ks = JSON.parse(readFileSync(`${process.env.HOME}/.sui/sui_config/sui.keystore`, "utf8"));
const raw = Buffer.from(ks[0], "base64");
const keypair = Ed25519Keypair.fromSecretKey(raw.slice(1)); // skip flag byte
const address = keypair.getPublicKey().toSuiAddress();
console.log(`\nWallet: ${address}`);

// ── Client ────────────────────────────────────────────────────────────────────
const client = new CoreClient({ url: SUI_RPC, network: "testnet" });

async function rpcPost(method, params) {
  const res = await fetch(SUI_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`RPC ${method}: ${JSON.stringify(json.error)}`);
  return json.result;
}

async function signAndExecute(tx) {
  tx.setSender(address);
  const bytes = await tx.build({ client });
  const { signature } = await keypair.signTransaction(bytes);
  const result = await rpcPost("sui_executeTransactionBlock", [
    Buffer.from(bytes).toString("base64"),
    [signature],
    { showEffects: true, showEvents: true },
    "WaitForLocalExecution",
  ]);
  const status = result.effects?.status?.status;
  if (status !== "success") throw new Error(`tx failed: ${result.effects?.status?.error}`);
  return result;
}

async function devInspect(tx) {
  tx.setSender(address);
  const bytes = await tx.build({ client });
  return rpcPost("sui_devInspectTransactionBlock", [
    address,
    Buffer.from(bytes).toString("base64"),
    null, null,
  ]);
}

// ── Math helpers ──────────────────────────────────────────────────────────────
function normCDF(x) {
  const t = 1.0 / (1.0 + 0.2316419 * Math.abs(x));
  const d = 0.3989422819 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))));
  return x >= 0 ? 1 - p : p;
}

function computeStrike(spot, bps, tick = 1_000_000_000n, min = 50_000_000_000_000n) {
  const raw = (spot * (10_000n - bps)) / 10_000n;
  const s = (raw / tick) * tick;
  return s < min ? min : s;
}

function computeMaxViableBps(svi, forward, spot, expiryMs, tick, min) {
  const SCALE = 1_000_000_000;
  function upFixed(bps) {
    const strike = computeStrike(spot, BigInt(bps), tick, min);
    const T = (expiryMs - Date.now()) / (365.25 * 24 * 3600 * 1000);
    if (T <= 0) return SCALE;
    const k = Math.log(Number(strike) / Number(forward));
    const { a, b, rho, m, sigma } = svi;
    const w = a + b * (rho * (k - m) + Math.sqrt((k - m) ** 2 + sigma ** 2));
    if (w <= 0) return SCALE;
    const d2 = -k / Math.sqrt(w) - Math.sqrt(w) / 2;
    return Math.round(normCDF(d2) * SCALE);
  }
  let lo = 10, hi = 5000;
  if (upFixed(lo) >= SCALE) return 0;
  if (upFixed(hi) < SCALE) return hi;
  while (lo < hi - 1) {
    const mid = Math.floor((lo + hi) / 2);
    upFixed(mid) < SCALE ? lo = mid : hi = mid;
  }
  return lo;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 0: Check dUSDC balance
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Step 0: dUSDC balance ──");
const coinsRes = await rpcPost("suix_getCoins", [address, DUSDC_TYPE, null, 10]);
const dusdcCoins = coinsRes?.data ?? [];
const dusdcBalance = dusdcCoins.reduce((s, c) => s + BigInt(c.balance), 0n);
console.log(`dUSDC: ${Number(dusdcBalance) / 1e6} dUSDC`);
if (dusdcBalance === 0n) { console.error("No dUSDC — request from DeepBook team"); process.exit(1); }

// ─────────────────────────────────────────────────────────────────────────────
// Step 1: Find or create manager
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Step 1: Manager ──");
let managerId = null;
let createManagerDigest = null;

const eventsRes = await rpcPost("suix_queryEvents", [
  { MoveEventType: `${PREDICT_PACKAGE}::predict_manager::PredictManagerCreated` },
  null, 50, false,
]);
for (const e of eventsRes?.data ?? []) {
  if ((e.parsedJson?.owner ?? "").toLowerCase() === address.toLowerCase()) {
    const raw = e.parsedJson.manager_id;
    managerId = raw.startsWith("0x") ? raw : `0x${raw}`;
    break;
  }
}

if (managerId) {
  console.log(`Existing manager: ${managerId}`);
} else {
  console.log("Creating manager…");
  const tx = new Transaction();
  tx.moveCall({ target: `${PREDICT_PACKAGE}::predict::create_manager`, arguments: [] });
  const result = await signAndExecute(tx);
  createManagerDigest = result.digest;
  console.log(`Create manager tx: ${createManagerDigest}`);
  for (const e of result.events ?? []) {
    if (e.type?.includes("PredictManagerCreated")) {
      const raw = e.parsedJson?.manager_id;
      managerId = raw?.startsWith("0x") ? raw : `0x${raw}`;
      break;
    }
  }
  if (!managerId) throw new Error("manager_id not found in events");
  console.log(`Manager: ${managerId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2: Deposit if needed
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Step 2: Deposit ──");

async function getManagerBalance() {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PREDICT_PACKAGE}::predict_manager::balance`,
    typeArguments: [DUSDC_TYPE],
    arguments: [tx.object(managerId)],
  });
  const res = await devInspect(tx);
  const bytes = res.results?.[0]?.returnValues?.[0]?.[0];
  if (!bytes || bytes.length < 8) return 0n;
  let val = 0n;
  for (let i = 7; i >= 0; i--) val = val * 256n + BigInt(bytes[i]);
  return val;
}

let mgrBalance = await getManagerBalance();
console.log(`Manager balance: ${Number(mgrBalance) / 1e6} dUSDC`);

let depositDigest = null;
const DEPOSIT_AMOUNT = 5_000_000n; // 5 dUSDC
if (mgrBalance < DEPOSIT_AMOUNT) {
  const needed = DEPOSIT_AMOUNT - mgrBalance;
  console.log(`Depositing ${Number(needed)/1e6} dUSDC…`);
  const tx = new Transaction();
  if (dusdcCoins.length > 1) {
    tx.mergeCoins(tx.object(dusdcCoins[0].coinObjectId),
                  dusdcCoins.slice(1).map(c => tx.object(c.coinObjectId)));
  }
  const [coin] = tx.splitCoins(tx.object(dusdcCoins[0].coinObjectId), [tx.pure.u64(needed)]);
  tx.moveCall({
    target: `${PREDICT_PACKAGE}::predict_manager::deposit`,
    typeArguments: [DUSDC_TYPE],
    arguments: [tx.object(managerId), coin],
  });
  const result = await signAndExecute(tx);
  depositDigest = result.digest;
  console.log(`Deposit tx: ${depositDigest}`);
  mgrBalance = await getManagerBalance();
  console.log(`Manager balance after: ${Number(mgrBalance)/1e6} dUSDC`);
} else {
  console.log("Sufficient balance, skipping deposit");
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3: Oracle + SVI
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Step 3: Oracle ──");
const oraclesRaw = await fetch(`${PREDICT_API}/predicts/${PREDICT_ID}/oracles`).then(r => r.json());
const now = Date.now();
const SAFE_TTL = 2 * 60 * 60 * 1000;
const activeOracles = oraclesRaw
  .filter(o => o.status === "active" && Number(o.expiry) > now + SAFE_TTL)
  .map(o => ({
    id: o.oracle_id.startsWith("0x") ? o.oracle_id : `0x${o.oracle_id}`,
    expiry: Number(o.expiry),
    tick_size: BigInt(o.tick_size ?? 1_000_000_000),
    min_strike: BigInt(o.min_strike ?? 50_000_000_000_000),
    underlying_asset: o.underlying_asset,
  }))
  .sort((a, b) => b.expiry - a.expiry);

if (activeOracles.length === 0) throw new Error("No active oracles");
const oracle = activeOracles[0];
console.log(`Oracle: ${oracle.id}`);
console.log(`Expiry: ${new Date(oracle.expiry).toISOString()} (${((oracle.expiry-now)/86_400_000).toFixed(1)}d left)`);

// Price
const pricesRaw = await fetch(`${PREDICT_API}/oracles/${oracle.id}/prices`).then(r => r.json());
const spot    = BigInt(pricesRaw[0].spot);
const forward = BigInt(pricesRaw[0].forward);
console.log(`Spot: $${(Number(spot)/1e9).toLocaleString()}`);

// On-chain SVI
const oracleObj = await rpcPost("sui_getObject", [oracle.id, { showContent: true }]);
const fields = oracleObj?.data?.content?.fields;
const sf = fields?.svi?.fields;
if (!sf) throw new Error("No SVI");
const svi = {
  a:     Number(sf.a) / 1e9,
  b:     Number(sf.b) / 1e9,
  rho:   Number(sf.rho.fields.magnitude) / 1e9 * (sf.rho.fields.is_negative ? -1 : 1),
  m:     Number(sf.m.fields.magnitude)   / 1e9 * (sf.m.fields.is_negative   ? -1 : 1),
  sigma: Number(sf.sigma) / 1e9,
};
console.log(`SVI: a=${svi.a.toFixed(6)} b=${svi.b.toFixed(6)} rho=${svi.rho.toFixed(6)} m=${svi.m.toFixed(6)} sigma=${svi.sigma.toFixed(6)}`);

const maxBps = computeMaxViableBps(svi, forward, spot, oracle.expiry, oracle.tick_size, oracle.min_strike);
console.log(`Max viable drop: ${(maxBps/100).toFixed(1)}% (${maxBps} bps)`);

const targetBps = Math.max(10, Math.floor(maxBps * 0.80 / 10) * 10);
const strike = computeStrike(spot, BigInt(targetBps), oracle.tick_size, oracle.min_strike);
console.log(`Using ${(targetBps/100).toFixed(1)}% → strike $${(Number(strike)/1e9).toLocaleString()}`);

// ─────────────────────────────────────────────────────────────────────────────
// Step 4: devInspect
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Step 4: devInspect ──");
const COVER_AMOUNT = 1_000_000n; // 1 dUSDC
const assetBytes = Array.from(new TextEncoder().encode(oracle.underlying_asset));
const U64_MAX = BigInt("18446744073709551615");

function buildBuyTx(maxPremium) {
  const tx = new Transaction();
  tx.moveCall({
    target: `${INSUIRANCE_PKG}::vault::buy_cover_entry`,
    typeArguments: [DUSDC_TYPE],
    arguments: [
      tx.object(SHIELD_VAULT_ID),
      tx.object(PREDICT_ID),
      tx.object(managerId),
      tx.object(oracle.id),
      tx.pure.u64(strike),
      tx.pure.u64(BigInt(oracle.expiry)),
      tx.pure.u64(COVER_AMOUNT),
      tx.pure.u64(maxPremium),
      tx.pure.vector("u8", assetBytes),
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}

const simResult = await devInspect(buildBuyTx(U64_MAX));
if (simResult.effects?.status?.status !== "success") {
  console.error("Simulation FAILED:", simResult.effects?.status?.error);
  process.exit(1);
}
console.log("Simulation: SUCCESS");

let premiumPaid = 0n;
for (const ev of simResult.events ?? []) {
  if (ev.type?.includes("::policy::CoverBought")) {
    premiumPaid = BigInt(ev.parsedJson?.premium_paid ?? "0");
    break;
  }
}
const maxPremium = premiumPaid > 0n ? (premiumPaid * 115n) / 100n : COVER_AMOUNT / 20n;
console.log(`Sim premium: ${Number(premiumPaid)/1e6} dUSDC → max with 15% buffer: ${Number(maxPremium)/1e6} dUSDC`);

// ─────────────────────────────────────────────────────────────────────────────
// Step 5: Buy cover
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── Step 5: Buy cover ──");
const buyResult = await signAndExecute(buildBuyTx(maxPremium));
const buyDigest = buyResult.digest;
console.log(`Buy cover tx: ${buyDigest}`);

let policyId = null;
let actualPremium = 0n;
for (const ev of buyResult.events ?? []) {
  if (ev.type?.includes("::policy::CoverBought")) {
    policyId = ev.parsedJson?.policy_id;
    actualPremium = BigInt(ev.parsedJson?.premium_paid ?? "0");
    break;
  }
}
if (!policyId) {
  for (const obj of buyResult.effects?.created ?? []) {
    const ownedBy = obj.owner?.AddressOwner;
    if (ownedBy?.toLowerCase() === address.toLowerCase()) {
      policyId = obj.reference?.objectId;
    }
  }
}
console.log(`Policy NFT: ${policyId}`);
console.log(`Actual premium: ${Number(actualPremium)/1e6} dUSDC`);

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
console.log(`
══════════════════════════════════════════════════
E2E TEST RESULTS — ${new Date().toISOString()}
══════════════════════════════════════════════════
Wallet:            ${address}
Manager:           ${managerId}
Oracle:            ${oracle.id}
Oracle expiry:     ${new Date(oracle.expiry).toISOString()}
Drop used:         ${(targetBps/100).toFixed(1)}% (max viable: ${(maxBps/100).toFixed(1)}%)
Strike:            $${(Number(strike)/1e9).toLocaleString()}
Cover amount:      1 dUSDC
Premium paid:      ${Number(actualPremium)/1e6} dUSDC
Policy NFT:        ${policyId}
──────────────────────────────────────────────────
TX: create_manager ${createManagerDigest ?? "(pre-existing)"}
TX: deposit        ${depositDigest ?? "(skipped)"}
TX: buy_cover      ${buyDigest}
══════════════════════════════════════════════════
`);
