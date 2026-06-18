"use client";

import { useState, useEffect, useCallback } from "react";
import {
  useSignAndExecuteTransaction,
  useSuiClient,
  useSuiClientQuery,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import {
  PREDICT_ID,
  PREDICT_PACKAGE,
  DUSDC_TYPE,
  computeStrike,
  formatUsd,
  formatDusdc,
  getOraclePrice,
  getActiveOracles,
  getOracleSVI,
  computeFairPremium,
  type OracleInfo,
  type OraclePrice,
  type SVIParams,
} from "@/lib/predict-api";
import { DepthAnimation } from "@/components/DepthAnimation";

const INSUIRANCE_PACKAGE = process.env.NEXT_PUBLIC_INSUIRANCE_PACKAGE ?? "";
const CLOCK_ID = "0x6";
const MANAGER_KEY = (addr: string) => `managerId_${addr}`;

const TRIGGERS = [
  { label: "5%", bps: 500n, desc: "Mild dip" },
  { label: "10%", bps: 1000n, desc: "Correction" },
  { label: "20%", bps: 2000n, desc: "Crash" },
];

const STRATEGIES: { label: string; sub: string; bpsSet: bigint[]; color: string }[] = [
  { label: "Conservative", sub: "5% drop",   bpsSet: [500n],             color: "sky" },
  { label: "Balanced",     sub: "10% drop",  bpsSet: [1000n],            color: "violet" },
  { label: "Black Swan",   sub: "20% drop",  bpsSet: [2000n],            color: "rose" },
  { label: "Full Ladder",  sub: "All levels", bpsSet: [500n, 1000n, 2000n], color: "emerald" },
];

const COLOR_MAP: Record<string, { active: string }> = {
  sky:     { active: "bg-sky-600 border-sky-500" },
  violet:  { active: "bg-violet-600 border-violet-500" },
  rose:    { active: "bg-rose-600 border-rose-500" },
  emerald: { active: "bg-emerald-600 border-emerald-500" },
};

interface Props {
  address: string;
  suggestedCover?: string;
}

export function CoverForm({ address, suggestedCover }: Props) {
  const { mutateAsync: signAndExecute, isPending } = useSignAndExecuteTransaction();
  const client = useSuiClient();

  // Manager state
  const [managerId, setManagerId]       = useState<string | null>(null);
  const [managerBalance, setManagerBalance] = useState<bigint | null>(null);
  const [loadingManager, setLoadingManager] = useState(true);

  // Market data
  const [oracles, setOracles]           = useState<OracleInfo[]>([]);
  const [price, setPrice]               = useState<OraclePrice | null>(null);
  const [loadingPrice, setLoadingPrice] = useState(true);
  const [sviParams, setSviParams]       = useState<SVIParams | null>(null);

  // Form state
  const [selectedTriggers, setSelectedTriggers] = useState<Set<string>>(
    suggestedCover ? new Set(["500", "1000", "2000"]) : new Set(["1000"])
  );
  const [activeStrategy, setActiveStrategy] = useState<string | null>(
    suggestedCover ? "Full Ladder" : "Balanced"
  );
  const [oracleOption, setOracleOption] = useState<OracleInfo | null>(null);
  const [coverAmount, setCoverAmount]   = useState(suggestedCover ?? "5");
  const [depositAmount, setDepositAmount] = useState("5");

  // UI state
  const [txDigest, setTxDigest]         = useState<string | null>(null);
  const [error, setError]               = useState<string | null>(null);
  const [view, setView]                 = useState<"buy" | "deposit">("buy");
  const [showDepthAnim, setShowDepthAnim] = useState(false);
  const [showExpiryPicker, setShowExpiryPicker] = useState(false);

  // dUSDC wallet balance
  const { data: dusdcCoins, refetch: refetchCoins } = useSuiClientQuery(
    "getCoins",
    { owner: address, coinType: DUSDC_TYPE },
    { refetchInterval: 15_000 }
  );
  const walletCoins   = dusdcCoins?.data ?? [];
  const walletBalance = walletCoins.reduce((s, c) => s + BigInt(c.balance), 0n);

  const fetchOnChainBalance = useCallback(
    async (mgrId: string): Promise<bigint> => {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PREDICT_PACKAGE}::predict_manager::balance`,
        typeArguments: [DUSDC_TYPE],
        arguments: [tx.object(mgrId)],
      });
      const result = await client.devInspectTransactionBlock({
        transactionBlock: tx,
        sender: address,
      });
      const bytes = result.results?.[0]?.returnValues?.[0]?.[0];
      if (!bytes || bytes.length < 8) return 0n;
      let val = 0n;
      for (let i = 7; i >= 0; i--) val = val * 256n + BigInt(bytes[i]);
      return val;
    },
    [address, client]
  );

  const loadManager = useCallback(async () => {
    setLoadingManager(true);
    try {
      const cached = localStorage.getItem(MANAGER_KEY(address));
      if (cached) {
        setManagerId(cached);
        setManagerBalance(await fetchOnChainBalance(cached));
        setLoadingManager(false);
        return;
      }
      const events = await client.queryEvents({
        query: { MoveEventType: `${PREDICT_PACKAGE}::predict_manager::PredictManagerCreated` },
        limit: 50,
        order: "descending",
      });
      const found = events.data.find((e) => (e.parsedJson as any)?.owner === address);
      if (found) {
        const id = (found.parsedJson as any)?.manager_id as string;
        const normalized = id.startsWith("0x") ? id : `0x${id}`;
        localStorage.setItem(MANAGER_KEY(address), normalized);
        setManagerId(normalized);
        setManagerBalance(await fetchOnChainBalance(normalized));
      }
    } catch {}
    finally { setLoadingManager(false); }
  }, [address, client, fetchOnChainBalance]);

  useEffect(() => { loadManager(); }, [loadManager]);

  // Sync when parent calculator pushes a suggestion
  useEffect(() => {
    if (!suggestedCover) return;
    setCoverAmount(suggestedCover);
    setDepositAmount(suggestedCover);
    setActiveStrategy("Full Ladder");
    setSelectedTriggers(new Set(["500", "1000", "2000"]));
    setView("buy");
  }, [suggestedCover]);

  useEffect(() => {
    getActiveOracles()
      .then((list) => {
        setOracles(list);
        if (list.length > 0) setOracleOption(list[0]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!oracleOption) return;
    let cancelled = false;
    async function fetchPrice() {
      setLoadingPrice(true);
      try {
        const p = await getOraclePrice(oracleOption!.id);
        if (!cancelled) setPrice(p);
      } catch {}
      finally { if (!cancelled) setLoadingPrice(false); }
    }
    fetchPrice();
    const t = setInterval(fetchPrice, 15_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [oracleOption?.id]);

  useEffect(() => {
    if (!oracleOption) return;
    setSviParams(null);
    getOracleSVI(oracleOption.id)
      .then(setSviParams)
      .catch(() => {});
  }, [oracleOption?.id]);

  function toggleTrigger(bps: bigint) {
    const key = bps.toString();
    setActiveStrategy(null);
    setSelectedTriggers((prev) => {
      const next = new Set(prev);
      if (next.has(key) && next.size > 1) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function applyStrategy(s: typeof STRATEGIES[number]) {
    setActiveStrategy(s.label);
    setSelectedTriggers(new Set(s.bpsSet.map((b) => b.toString())));
  }

  const spotRaw    = price ? BigInt(price.spot)    : 0n;
  const forwardRaw = price ? BigInt(price.forward) : 0n;
  const coverRaw   = BigInt(Math.round(parseFloat(coverAmount   || "0") * 1_000_000));
  const depositRaw = BigInt(Math.round(parseFloat(depositAmount || "0") * 1_000_000));

  const activeTriggers = TRIGGERS.filter((t) => selectedTriggers.has(t.bps.toString()));

  function getMaxPremium(bps: bigint): bigint {
    if (sviParams && forwardRaw > 0n && oracleOption) {
      const strike = computeStrike(spotRaw, bps);
      const fair = computeFairPremium(sviParams, forwardRaw, strike, oracleOption.expiry, coverRaw);
      if (fair > 0n) return (fair * 115n) / 100n;
    }
    return (coverRaw * 20n) / 100n;
  }

  const totalMaxPremium = activeTriggers.reduce((acc, t) => acc + getMaxPremium(t.bps), 0n);

  async function handleCreateManager() {
    setError(null); setTxDigest(null);
    try {
      const tx = new Transaction();
      tx.moveCall({ target: `${PREDICT_PACKAGE}::predict::create_manager`, arguments: [] });
      const result = await signAndExecute({ transaction: tx });
      const fullTx = await client.getTransactionBlock({ digest: result.digest, options: { showEvents: true } });
      const event  = fullTx.events?.find((e) => e.type.includes("PredictManagerCreated"));
      const rawId  = (event?.parsedJson as any)?.manager_id as string | undefined;
      if (rawId) {
        const normalized = rawId.startsWith("0x") ? rawId : `0x${rawId}`;
        localStorage.setItem(MANAGER_KEY(address), normalized);
        setManagerId(normalized);
        setManagerBalance(0n);
        setTxDigest(result.digest);
      } else {
        setError("Manager created but could not find ID — refresh the page");
      }
    } catch (e: any) { setError(e.message ?? "Transaction failed"); }
  }

  async function handleDeposit() {
    if (!managerId) return;
    setError(null); setTxDigest(null);
    if (depositRaw === 0n)          { setError("Enter deposit amount"); return; }
    if (depositRaw > walletBalance) { setError("Insufficient dUSDC in wallet"); return; }
    if (walletCoins.length === 0)   { setError("No dUSDC coins found in wallet"); return; }
    try {
      const tx = new Transaction();
      if (walletCoins.length > 1) {
        tx.mergeCoins(
          tx.object(walletCoins[0].coinObjectId),
          walletCoins.slice(1).map((c) => tx.object(c.coinObjectId))
        );
      }
      const [coin] = tx.splitCoins(tx.object(walletCoins[0].coinObjectId), [tx.pure.u64(depositRaw)]);
      tx.moveCall({
        target: `${PREDICT_PACKAGE}::predict_manager::deposit`,
        typeArguments: [DUSDC_TYPE],
        arguments: [tx.object(managerId), coin],
      });
      const result = await signAndExecute({ transaction: tx });
      setTxDigest(result.digest);
      refetchCoins();
      setManagerBalance(await fetchOnChainBalance(managerId));
      setView("buy");
    } catch (e: any) { setError(e.message ?? "Deposit failed"); }
  }

  async function handleBuyCover() {
    if (!managerId)         { setError("Set up a manager first"); return; }
    if (!INSUIRANCE_PACKAGE){ setError("Package not configured"); return; }
    if (!oracleOption)      { setError("No active oracle available"); return; }
    if (coverRaw === 0n)    { setError("Enter cover amount"); return; }
    if (activeTriggers.length === 0) { setError("Select at least one trigger"); return; }
    if (totalMaxPremium === 0n) {
      setError("Could not compute premium — oracle may be expired or price unavailable");
      return;
    }
    if (managerBalance !== null && totalMaxPremium > managerBalance) {
      setError("Insufficient manager balance — deposit more dUSDC first");
      return;
    }
    setError(null); setTxDigest(null);

    try {
      const tx = new Transaction();
      const policies: any[] = [];
      const assetBytes = Array.from(new TextEncoder().encode(oracleOption.underlying_asset));

      for (const trigger of activeTriggers) {
        const strike     = computeStrike(spotRaw, trigger.bps);
        const maxPremium = getMaxPremium(trigger.bps);
        const policy = tx.moveCall({
          target: `${INSUIRANCE_PACKAGE}::policy::buy_cover`,
          typeArguments: [DUSDC_TYPE],
          arguments: [
            tx.object(PREDICT_ID),
            tx.object(managerId),
            tx.object(oracleOption.id),
            tx.pure.u64(strike),
            tx.pure.u64(BigInt(oracleOption.expiry)),
            tx.pure.u64(coverRaw),
            tx.pure.u64(maxPremium),
            tx.pure.vector("u8", assetBytes),
            tx.object(CLOCK_ID),
          ],
        });
        policies.push(policy);
      }
      tx.transferObjects(policies, address);

      const result = await signAndExecute({ transaction: tx });
      setTxDigest(result.digest);
      setShowDepthAnim(true);
      setManagerBalance(await fetchOnChainBalance(managerId));
    } catch (e: any) { setError(e.message ?? "Transaction failed"); }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loadingManager) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-gray-400 animate-pulse">
        Loading…
      </div>
    );
  }

  if (!managerId) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-lg">Set Up Your Account</h2>
          <p className="text-sm text-gray-400 mt-1">One-time setup to start buying cover.</p>
        </div>
        {error    && <p className="text-sm text-red-400 bg-red-950/30 border border-red-800/40 rounded-lg px-4 py-2">{error}</p>}
        {txDigest && <p className="text-sm text-green-400">Done! tx: {txDigest.slice(0, 16)}…</p>}
        <button
          onClick={handleCreateManager}
          disabled={isPending}
          className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 py-3 font-semibold transition-colors"
        >
          {isPending ? "Creating…" : "Create Manager"}
        </button>
      </div>
    );
  }

  return (
    <>
      {showDepthAnim && (
        <DepthAnimation type="cover" onDone={() => setShowDepthAnim(false)} />
      )}

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-5">

        {/* Manager balance */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Manager Balance</span>
          <div className="flex items-center gap-2">
            <span className="font-mono font-semibold">
              {managerBalance !== null ? formatDusdc(managerBalance) : "—"}
            </span>
            <button
              onClick={() => { setView(view === "deposit" ? "buy" : "deposit"); setError(null); }}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              {view === "deposit" ? "← Back" : "+ Deposit"}
            </button>
          </div>
        </div>

        {/* Deposit panel */}
        {view === "deposit" && (
          <div className="space-y-3 border border-white/10 rounded-xl p-4">
            <div className="text-sm text-gray-400">
              Wallet: <span className="font-mono text-white">{formatDusdc(walletBalance)}</span>
            </div>
            <div className="flex rounded-lg border border-white/10 bg-white/5 overflow-hidden">
              <input
                type="number" min="0.01" step="0.01" value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="flex-1 bg-transparent px-3 py-2 text-sm text-white focus:outline-none"
                placeholder="5"
              />
              <span className="flex items-center pr-3 text-sm text-gray-400">DUSDC</span>
            </div>
            {error    && <p className="text-sm text-red-400">{error}</p>}
            {txDigest && <p className="text-sm text-green-400">Deposited! tx: {txDigest.slice(0, 16)}…</p>}
            <button
              onClick={handleDeposit}
              disabled={isPending || walletBalance === 0n}
              className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 py-2.5 font-semibold text-sm transition-colors"
            >
              {isPending ? "Depositing…" : walletBalance === 0n ? "No dUSDC in wallet" : "Deposit"}
            </button>
          </div>
        )}

        {/* Buy cover form */}
        {view === "buy" && (
          <>
            {/* Spot price */}
            <div className="flex items-center justify-between text-sm border-t border-white/10 pt-4">
              <span className="text-gray-400">{oracleOption?.underlying_asset ?? "Asset"} Spot</span>
              <span className="font-mono font-semibold">
                {loadingPrice ? "Loading…" : price ? formatUsd(BigInt(price.spot)) : "—"}
              </span>
            </div>

            {/* Strategy presets */}
            <div className="space-y-2">
              <label className="text-sm text-gray-400">Strategy</label>
              <div className="grid grid-cols-2 gap-2">
                {STRATEGIES.map((s) => {
                  const isActive = activeStrategy === s.label;
                  return (
                    <button
                      key={s.label}
                      onClick={() => applyStrategy(s)}
                      className={`rounded-lg border px-3 py-2.5 text-left transition-all ${
                        isActive
                          ? `${COLOR_MAP[s.color].active} text-white`
                          : "border-white/10 bg-white/5 text-gray-300 hover:bg-white/10"
                      }`}
                    >
                      <p className="text-xs font-semibold">{s.label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom trigger toggles */}
            <div className="space-y-2">
              <label className="text-sm text-gray-400">Coverage Triggers</label>
              <div className="flex gap-2">
                {TRIGGERS.map((t) => {
                  const isOn   = selectedTriggers.has(t.bps.toString());
                  const strike = spotRaw > 0n ? computeStrike(spotRaw, t.bps) : null;
                  return (
                    <button
                      key={t.bps.toString()}
                      onClick={() => toggleTrigger(t.bps)}
                      className={`flex-1 rounded-lg py-2.5 text-sm font-medium border transition-colors ${
                        isOn
                          ? "bg-blue-600 border-blue-500 text-white"
                          : "border-white/10 bg-white/5 text-gray-400 hover:bg-white/10"
                      }`}
                    >
                      <div>{t.label}</div>
                      <div className={`text-xs mt-0.5 ${isOn ? "text-blue-200" : "text-gray-600"}`}>
                        {strike ? formatUsd(strike) : t.desc}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Expiry — pill trigger + modal picker */}
            <div className="space-y-2">
              <label className="text-sm text-gray-400">Expiry</label>
              {oracles.length === 0 ? (
                <p className="text-sm text-gray-500">Loading markets…</p>
              ) : (
                <ExpiryPicker
                  oracles={oracles}
                  selected={oracleOption}
                  onSelect={(o) => { setOracleOption(o); setShowExpiryPicker(false); }}
                  open={showExpiryPicker}
                  onToggle={() => setShowExpiryPicker((v) => !v)}
                  onClose={() => setShowExpiryPicker(false)}
                />
              )}
            </div>

            {/* Cover amount */}
            <div className="space-y-2">
              <label className="text-sm text-gray-400">Cover Amount <span className="text-gray-600">(per trigger)</span></label>
              <div className="flex rounded-lg border border-white/10 bg-white/5 overflow-hidden">
                <input
                  type="number" min="0.01" step="0.01" value={coverAmount}
                  onChange={(e) => setCoverAmount(e.target.value)}
                  className="flex-1 bg-transparent px-3 py-2 text-sm text-white focus:outline-none"
                  placeholder="5"
                />
                <span className="flex items-center pr-3 text-sm text-gray-400">DUSDC</span>
              </div>
            </div>

            {/* Payout scenarios */}
            {coverRaw > 0n && spotRaw > 0n && activeTriggers.length > 0 && (
              <div className="rounded-xl bg-gradient-to-b from-white/5 to-white/[0.02] border border-white/10 p-4 space-y-3">
                <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Payout Scenarios</p>
                <div className="space-y-2">
                  {activeTriggers.map((t) => {
                    const strike = computeStrike(spotRaw, t.bps);
                    return (
                      <div key={t.bps.toString()} className="flex items-center gap-3 text-sm">
                        <span className="text-gray-500 w-14 shrink-0">≥{t.label} drop</span>
                        <span className="text-gray-400 font-mono text-xs">→ {formatUsd(strike)}</span>
                        <span className="ml-auto font-mono text-green-400 font-semibold">
                          +{formatDusdc(coverRaw)}
                        </span>
                      </div>
                    );
                  })}
                  {activeTriggers.length > 1 && (
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-white/10 text-gray-500">
                      <span>Total (if all {activeTriggers.length} fire)</span>
                      <span className="font-mono text-green-300 font-semibold">
                        +{formatDusdc(coverRaw * BigInt(activeTriggers.length))}
                      </span>
                    </div>
                  )}
                </div>
                <div className="border-t border-white/10 pt-2 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-gray-500">Policies Minted</p>
                    <p className="font-semibold text-white">{activeTriggers.length}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-500">
                      Max Premium{" "}
                      {sviParams
                        ? <span className="text-emerald-500">SVI</span>
                        : <span className="text-gray-600">est.</span>}
                    </p>
                    <p className="font-semibold text-yellow-400">{formatDusdc(totalMaxPremium)}</p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Error / Success */}
        {error && (
          <p className="text-sm text-red-400 bg-red-950/30 border border-red-800/40 rounded-lg px-4 py-2">
            {error}
          </p>
        )}
        {txDigest && view === "buy" && (
          <div className="text-sm text-green-400 bg-green-950/30 border border-green-800/40 rounded-lg px-4 py-2">
            <p className="font-semibold">
              {activeTriggers.length > 1 ? `${activeTriggers.length} cover policies purchased!` : "Cover purchased!"}
            </p>
            <p className="font-mono text-xs break-all mt-1">{txDigest}</p>
          </div>
        )}

        {/* Buy button */}
        {view === "buy" && (
          <button
            onClick={handleBuyCover}
            disabled={
              isPending ||
              loadingPrice ||
              coverRaw === 0n ||
              !oracleOption ||
              oracles.length === 0 ||
              activeTriggers.length === 0 ||
              (managerBalance !== null && managerBalance === 0n)
            }
            className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed py-3 font-semibold transition-colors"
          >
            {isPending
              ? `Signing ${activeTriggers.length} polic${activeTriggers.length > 1 ? "ies" : "y"}…`
              : managerBalance !== null && managerBalance === 0n
              ? "Deposit dUSDC first"
              : activeTriggers.length > 1
              ? `Buy ${activeTriggers.length}-Trigger Cover Package`
              : "Buy Cover"}
          </button>
        )}

        <p className="text-xs text-gray-600 text-center">
          Powered by DeepBook Predict · Sui Testnet
        </p>
      </div>
    </>
  );
}

// ── ExpiryPicker ─────────────────────────────────────────────────────────────

import { useRef, useEffect as useEffectRef } from "react";
import { type OracleInfo as OI } from "@/lib/predict-api";

function timeUntil(ms: number): { label: string; urgent: boolean } {
  const diff = ms - Date.now();
  if (diff <= 0) return { label: "Expired", urgent: true };
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (d > 0) return { label: `${d}d ${h}h`, urgent: d < 1 };
  if (h > 0) return { label: `${h}h ${m}m`,  urgent: h < 6 };
  return { label: `${m}m`, urgent: true };
}

interface ExpiryPickerProps {
  oracles:  OI[];
  selected: OI | null;
  onSelect: (o: OI) => void;
  open:     boolean;
  onToggle: () => void;
  onClose:  () => void;
}

function ExpiryPicker({ oracles, selected, onSelect, open, onToggle, onClose }: ExpiryPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // close on outside click
  useEffectRef(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  const selExpiry = selected ? new Date(selected.expiry) : null;
  const selDateStr = selExpiry?.toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
  const selTimeStr = selExpiry?.toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short",
  });
  const selTimer = selected ? timeUntil(selected.expiry) : null;

  return (
    <div ref={containerRef} className="relative">
      {/* ── Trigger pill ── */}
      <button
        onClick={onToggle}
        className={`w-full flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-all ${
          open
            ? "border-blue-500/60 bg-blue-950/30"
            : "border-white/10 bg-white/5 hover:bg-white/8 hover:border-white/20"
        }`}
      >
        {selected ? (
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xs font-bold text-white/60 uppercase tracking-wider shrink-0">
              {selected.underlying_asset}
            </span>
            <span className="font-mono text-sm text-white font-semibold truncate">
              {selDateStr}
            </span>
            <span className="text-xs text-gray-500 shrink-0">{selTimeStr}</span>
          </div>
        ) : (
          <span className="text-sm text-gray-500">Select expiry…</span>
        )}
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {selTimer && (
            <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${
              selTimer.urgent
                ? "bg-red-900/50 text-red-300"
                : "bg-white/8 text-gray-400"
            }`}>
              {selTimer.label}
            </span>
          )}
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            viewBox="0 0 16 16" fill="currentColor"
          >
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </button>

      {/* ── Dropdown panel ── */}
      {open && (
        <div
          className="absolute left-0 right-0 top-full mt-2 z-40 rounded-2xl border border-white/10 overflow-hidden shadow-2xl"
          style={{
            background: "rgba(4, 15, 30, 0.97)",
            backdropFilter: "blur(20px)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)",
          }}
        >
          <div className="px-4 pt-3 pb-2">
            <p className="text-xs text-gray-600 uppercase tracking-widest font-medium">
              Select expiry date
            </p>
          </div>

          <div className="divide-y divide-white/[0.05]">
            {oracles.map((o) => {
              const d       = new Date(o.expiry);
              const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
              const timeStr = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" });
              const timer   = timeUntil(o.expiry);
              const isSel   = selected?.id === o.id;

              // days until expiry — used to color the expiry distance bar
              const daysLeft = Math.max(0, (o.expiry - Date.now()) / 86_400_000);
              const barW = Math.min(100, (daysLeft / 30) * 100); // normalise to 30 days

              return (
                <button
                  key={o.id}
                  onClick={() => onSelect(o)}
                  className={`w-full flex items-center gap-4 px-4 py-3.5 text-left transition-colors ${
                    isSel
                      ? "bg-blue-600/20"
                      : "hover:bg-white/[0.04]"
                  }`}
                >
                  {/* Selected indicator */}
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isSel ? "bg-blue-400" : "bg-white/10"}`} />

                  {/* Main info */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white/50 uppercase tracking-wider">{o.underlying_asset}</span>
                      <span className="font-mono text-sm text-white font-semibold">{dateStr}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">{timeStr}</span>
                      {/* Time bar */}
                      <div className="flex-1 h-0.5 rounded-full bg-white/8 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${timer.urgent ? "bg-red-500/60" : "bg-blue-500/50"}`}
                          style={{ width: `${barW}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Countdown pill */}
                  <span className={`text-xs font-mono px-2.5 py-1 rounded-full shrink-0 ${
                    isSel
                      ? "bg-blue-500/25 text-blue-300"
                      : timer.urgent
                      ? "bg-red-900/40 text-red-400"
                      : "bg-white/8 text-gray-400"
                  }`}>
                    {timer.label}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="px-4 py-2.5 border-t border-white/[0.05]">
            <p className="text-xs text-gray-700">Longer expiry = more time for BTC to hit your strike</p>
          </div>
        </div>
      )}
    </div>
  );
}
