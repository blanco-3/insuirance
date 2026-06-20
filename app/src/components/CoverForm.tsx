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
  getVaultSummary,
  type OracleInfo,
  type OraclePrice,
  type SVIParams,
} from "@/lib/predict-api";
import { DepthAnimation } from "@/components/DepthAnimation";
import { parseError } from "@/lib/parseError";

const INSUIRANCE_PACKAGE = process.env.NEXT_PUBLIC_INSUIRANCE_PACKAGE ?? "";
const SHIELD_VAULT_ID    = process.env.NEXT_PUBLIC_SHIELD_VAULT_ID ?? "";
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

  // Vault utilization (0–1) — used to cap new cover when pool is near-full
  const [vaultUtil, setVaultUtil] = useState<number | null>(null);

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
    function dedup(list: OracleInfo[]): OracleInfo[] {
      // Filter client-side too (guards against stale API cache)
      const now = Date.now();
      const seen = new Set<number>();
      return list.filter((o) => {
        if (o.expiry <= now) return false;
        if (seen.has(o.expiry)) return false;
        seen.add(o.expiry);
        return true;
      });
    }

    async function fetchOracles() {
      try {
        const list = await getActiveOracles();
        const fresh = dedup(list);
        setOracles(fresh);
        // If selected oracle has expired, is wrong asset, or isn't in the new list → auto-advance
        setOracleOption((prev) => {
          if (!prev) return fresh[0] ?? null;
          const still = fresh.find((o) => o.id === prev.id);
          return still ?? fresh[0] ?? null;
        });
      } catch {}
    }

    fetchOracles();
    // Re-fetch every 60 s so expired oracles drop off and new ones appear
    const t = setInterval(fetchOracles, 60_000);
    return () => clearInterval(t);
  }, []);

  // Fetch DeepBook vault utilization — gate new cover purchases above 90%
  useEffect(() => {
    async function fetchUtil() {
      try {
        const summary = await getVaultSummary();
        setVaultUtil(summary.utilization ?? null);
      } catch {
        setVaultUtil(null);
      }
    }
    fetchUtil();
    const t = setInterval(fetchUtil, 30_000);
    return () => clearInterval(t);
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

  function computeStrikeForOracle(bps: bigint): bigint {
    return computeStrike(
      spotRaw, bps,
      oracleOption?.tick_size,
      oracleOption?.min_strike,
    );
  }

  function getMaxPremium(bps: bigint): bigint {
    if (sviParams && forwardRaw > 0n && oracleOption) {
      const strike = computeStrikeForOracle(bps);
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

      // Retry fetching the tx block — RPC may not have indexed it yet
      let fullTx: any = null;
      for (let attempt = 0; attempt < 6; attempt++) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        try {
          fullTx = await client.getTransactionBlock({ digest: result.digest, options: { showEvents: true } });
          break;
        } catch {}
      }

      const event = fullTx?.events?.find((e: any) => e.type.includes("PredictManagerCreated"));
      const rawId = (event?.parsedJson as any)?.manager_id as string | undefined;
      if (rawId) {
        const normalized = rawId.startsWith("0x") ? rawId : `0x${rawId}`;
        localStorage.setItem(MANAGER_KEY(address), normalized);
        setManagerId(normalized);
        setManagerBalance(0n);
        setTxDigest(result.digest);
      } else {
        setError("Manager created but could not find ID — refresh the page");
      }
    } catch (e: any) {
      const msg = parseError(e);
      if (msg) setError(msg);
    }
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
    } catch (e: any) {
      const msg = parseError(e);
      if (msg) setError(msg);
    }
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
        const strike     = computeStrikeForOracle(trigger.bps);
        const maxPremium = getMaxPremium(trigger.bps);
        // vault::buy_cover_entry: on-chain cover cap (90% of vault PLP) +
        // policy::buy_cover + internal transfer to sender.
        // No transferObjects needed — entry function handles it.
        tx.moveCall({
          target: `${INSUIRANCE_PACKAGE}::vault::buy_cover_entry`,
          typeArguments: [DUSDC_TYPE],
          arguments: [
            tx.object(SHIELD_VAULT_ID),
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
      }

      const result = await signAndExecute({ transaction: tx });
      setTxDigest(result.digest);
      setShowDepthAnim(true);
      setManagerBalance(await fetchOnChainBalance(managerId));
    } catch (e: any) {
      const msg = parseError(e);
      if (msg) setError(msg);
    }
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
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-5 h-5 rounded-full bg-blue-600 text-xs flex items-center justify-center font-bold shrink-0">1</span>
            <h2 className="font-semibold text-lg">One-Time Account Setup</h2>
          </div>
          <p className="text-sm text-gray-400 ml-7">
            Insuirance uses a <strong className="text-gray-300">PredictManager</strong> — a DeepBook Predict account that holds your dUSDC and signs option trades on your behalf. This is a one-time onchain transaction.
          </p>
        </div>

        <div className="ml-7 space-y-2 text-xs text-gray-500">
          {[
            { n: "1", t: "Create Manager", d: "Deploy your personal PredictManager (this step)" },
            { n: "2", t: "Deposit dUSDC",  d: "Fund your manager — used to pay option premiums" },
            { n: "3", t: "Buy Cover",       d: "Pick strike & expiry, mint Policy NFT onchain" },
          ].map((s) => (
            <div key={s.n} className="flex gap-2">
              <span className="shrink-0 mt-0.5" style={{ color: "rgba(42,212,255,.5)" }}>→</span>
              <span><strong className="text-gray-300">{s.t}</strong> — {s.d}</span>
            </div>
          ))}
        </div>

        {error    && <p className="text-sm text-red-400 bg-red-950/30 border border-red-800/40 rounded-lg px-4 py-2">{error}</p>}
        {txDigest && <p className="text-sm text-green-400">Done! tx: {txDigest.slice(0, 16)}…</p>}
        <button
          onClick={handleCreateManager}
          disabled={isPending}
          className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 py-3 font-semibold transition-colors"
        >
          {isPending ? "Creating…" : "Create Manager (Step 1 of 3)"}
        </button>
        <p className="text-xs text-gray-600 text-center">Requires SUI for gas · One-time only · Stored in your wallet</p>
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
            {walletBalance === 0n && (
              <div className="rounded-lg px-4 py-3 text-xs space-y-2" style={{ background: "rgba(42,212,255,.07)", border: "1px solid rgba(42,212,255,.18)" }}>
                <p className="font-bold text-sm" style={{ color: "#2ad4ff" }}>dUSDC needed</p>
                <p style={{ color: "rgba(160,210,240,.7)" }}>
                  dUSDC is a testnet token issued by the DeepBook team.
                  Request it via the <a href="https://discord.gg/sui" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "#2ad4ff" }}>Sui Discord</a> or from a DeepBook Predict team member.
                  SUI gas is available from <span className="font-semibold" style={{ color: "rgba(200,235,255,.8)" }}>#testnet-faucet</span>.
                </p>
              </div>
            )}
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
              <label className="text-sm text-gray-400">
                Coverage Triggers
                <span className="ml-2 text-xs text-gray-600">
                  {selectedTriggers.size > 1 ? `(${selectedTriggers.size} active)` : "· tap to add more"}
                </span>
              </label>
              <div className="flex gap-2">
                {TRIGGERS.map((t) => {
                  const isOn   = selectedTriggers.has(t.bps.toString());
                  const strike = spotRaw > 0n ? computeStrikeForOracle(t.bps) : null;
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

            {/* Expiry — horizontal timeline + sparkline */}
            <div className="space-y-1.5">
              <label className="text-sm text-gray-400">Expiry</label>
              {oracles.length === 0 ? (
                <p className="text-sm text-gray-500">Loading markets…</p>
              ) : (
                <ExpiryTimeline
                  oracles={oracles}
                  selected={oracleOption}
                  onSelect={setOracleOption}
                  coverRaw={coverRaw}
                  sviParams={sviParams}
                  forwardRaw={forwardRaw}
                  spotRaw={spotRaw}
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
                    const strike = computeStrikeForOracle(t.bps);
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
                      {" "}
                      <span
                        title="SVI fair value × 1.15 — the extra 15% is a slippage buffer that ensures your transaction succeeds even if the on-chain premium shifts slightly between quote and execution. Unused buffer is not charged."
                        className="cursor-help text-gray-600 hover:text-gray-400 text-xs"
                      >
                        ⓘ
                      </span>
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

        {/* Utilization warning — shown when DeepBook PLP pool nears capacity */}
        {vaultUtil !== null && vaultUtil >= 0.8 && view === "buy" && (
          <div className={`text-sm rounded-lg px-4 py-2 border ${
            vaultUtil >= 0.9
              ? "text-red-400 bg-red-950/30 border-red-800/40"
              : "text-amber-400 bg-amber-950/30 border-amber-800/40"
          }`}>
            <p className="font-semibold">
              {vaultUtil >= 0.9 ? "⚠ Vault at capacity" : "⚠ Vault near capacity"}
            </p>
            <p className="text-xs mt-0.5">
              DeepBook PLP pool utilization: {Math.round(vaultUtil * 100)}%
              {vaultUtil >= 0.9
                ? " — new cover purchases paused to protect LP depositors."
                : " — cover may be limited. Consider a smaller position."}
            </p>
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
              (managerBalance !== null && managerBalance === 0n) ||
              (vaultUtil !== null && vaultUtil >= 0.9)
            }
            className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed py-3 font-semibold transition-colors"
          >
            {isPending
              ? `Signing ${activeTriggers.length} polic${activeTriggers.length > 1 ? "ies" : "y"}…`
              : vaultUtil !== null && vaultUtil >= 0.9
              ? "Vault at capacity"
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

// ── ExpiryTimeline ────────────────────────────────────────────────────────────
// Horizontal scrollable card rail + premium sparkline chart above it.

import { useRef, useEffect as useEffectAlias } from "react";

interface TimelineProps {
  oracles:    OracleInfo[];
  selected:   OracleInfo | null;
  onSelect:   (o: OracleInfo) => void;
  coverRaw:   bigint;
  sviParams:  SVIParams | null;
  forwardRaw: bigint;
  spotRaw:    bigint;
}

function daysLeft(ms: number) { return Math.max(0, (ms - Date.now()) / 86_400_000); }

function countdown(ms: number): { label: string; urgent: boolean } {
  const diff = ms - Date.now();
  if (diff <= 0) return { label: "Expired", urgent: true };
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (d > 0) return { label: `${d}d ${h}h left`, urgent: d < 1 };
  if (h > 0) return { label: `${h}h ${m}m left`, urgent: h < 6 };
  return { label: `${m}m left`, urgent: true };
}

// Approximate relative premium using √T (no SVI needed per oracle — just for sparkline shape)
function approxPremiumFraction(expiryMs: number): number {
  const T = Math.max(0, (expiryMs - Date.now()) / (365.25 * 24 * 3600 * 1000));
  return Math.sqrt(T) * 0.30; // 30% IV proxy → premium as fraction of notional
}

// ── Sparkline ──────────────────────────────────────────────────────────────

function PremiumSparkline({
  oracles,
  selected,
}: {
  oracles: OracleInfo[];
  selected: OracleInfo | null;
}) {
  if (oracles.length < 2) return null;

  const W = 400;
  const H = 56;
  const PAD_X = 24;
  const PAD_Y = 8;

  const fractions = oracles.map((o) => approxPremiumFraction(o.expiry));
  const maxF = Math.max(...fractions, 0.001);

  const pts = fractions.map((f, i) => ({
    x: PAD_X + (i / (oracles.length - 1)) * (W - PAD_X * 2),
    y: H - PAD_Y - (f / maxF) * (H - PAD_Y * 2),
  }));

  // Smooth cubic bezier path
  function curvePath(points: { x: number; y: number }[]) {
    if (points.length < 2) return "";
    let d = `M${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const cur  = points[i];
      const cpX = (prev.x + cur.x) / 2;
      d += ` C${cpX},${prev.y} ${cpX},${cur.y} ${cur.x},${cur.y}`;
    }
    return d;
  }

  const linePath = curvePath(pts);
  const areaPath = `${linePath} L${pts[pts.length - 1].x},${H} L${pts[0].x},${H} Z`;

  const selIdx = selected ? oracles.findIndex((o) => o.id === selected.id) : -1;
  const selPt  = selIdx >= 0 ? pts[selIdx] : null;

  return (
    <div
      className="rounded-t-xl overflow-hidden"
      style={{ background: "rgba(2,10,22,0.7)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: 56, display: "block" }}
      >
        <defs>
          <linearGradient id="etGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="rgba(0,180,255,0.22)" />
            <stop offset="100%" stopColor="rgba(0,180,255,0.02)" />
          </linearGradient>
          <linearGradient id="etLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="rgba(0,150,230,0.4)" />
            <stop offset="100%" stopColor="rgba(0,210,255,0.7)" />
          </linearGradient>
        </defs>

        {/* Area fill */}
        <path d={areaPath} fill="url(#etGrad)" />
        {/* Line */}
        <path d={linePath} stroke="url(#etLine)" strokeWidth="1.5" fill="none" strokeLinecap="round" />

        {/* Oracle dots */}
        {pts.map((p, i) => {
          const isSel = oracles[i].id === selected?.id;
          return (
            <circle
              key={i}
              cx={p.x} cy={p.y}
              r={isSel ? 4.5 : 3}
              fill={isSel ? "#00d4ff" : "rgba(0,180,255,0.45)"}
              stroke={isSel ? "rgba(0,212,255,0.3)" : "none"}
              strokeWidth={isSel ? 6 : 0}
            />
          );
        })}

        {/* Selected vertical line */}
        {selPt && (
          <line
            x1={selPt.x} y1={0} x2={selPt.x} y2={H}
            stroke="rgba(0,212,255,0.25)" strokeWidth="1" strokeDasharray="3 3"
          />
        )}

        {/* Y-axis label */}
        <text x={4} y={13} fontSize={7} fill="rgba(120,170,220,0.4)" fontFamily="monospace">
          est. cost ↑
        </text>
      </svg>
    </div>
  );
}

// ── Timeline cards ─────────────────────────────────────────────────────────

function ExpiryTimeline({ oracles, selected, onSelect }: TimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll selected card into view when selection changes
  useEffectAlias(() => {
    if (!scrollRef.current || !selected) return;
    const el = scrollRef.current.querySelector<HTMLElement>(`[data-oid="${selected.id}"]`);
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selected?.id]);

  return (
    <div className="rounded-xl overflow-hidden border border-white/8" style={{ background: "rgba(3,12,26,0.6)" }}>
      {/* Sparkline above */}
      <PremiumSparkline oracles={oracles} selected={selected} />

      {/* Scrollable card rail */}
      <div
        ref={scrollRef}
        className="overflow-x-auto"
        style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
      >
        <div className="flex gap-0 p-0" style={{ width: "max-content", minWidth: "100%" }}>
          {oracles.map((o, i) => {
            const isSel = selected?.id === o.id;
            const d     = new Date(o.expiry);
            const mon   = d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
            const day   = d.toLocaleDateString("en-US", { day: "numeric",  timeZone: "UTC" });
            const time  = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
            const { label: cd, urgent } = countdown(o.expiry);
            const days  = daysLeft(o.expiry);

            return (
              <button
                key={o.id}
                data-oid={o.id}
                onClick={() => onSelect(o)}
                className="relative flex flex-col items-center gap-1.5 px-4 py-3 transition-colors shrink-0"
                style={{
                  minWidth: 96,
                  background: isSel ? "rgba(0,100,200,0.18)" : "transparent",
                  borderRight: i < oracles.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                }}
              >
                {/* Selected top-bar */}
                {isSel && (
                  <div
                    className="absolute top-0 left-0 right-0 h-0.5"
                    style={{ background: "linear-gradient(to right, transparent, #00d4ff, transparent)" }}
                  />
                )}

                {/* Date */}
                <div className="text-center">
                  <p className="text-xs text-gray-500 leading-none">{mon}</p>
                  <p className={`text-xl font-bold font-mono leading-tight ${isSel ? "text-white" : "text-gray-300"}`}>
                    {day}
                  </p>
                  <p className="text-xs text-gray-600 leading-none">{time} <span style={{ color: "rgba(100,130,170,0.5)" }}>UTC</span></p>
                </div>

                {/* Countdown pill */}
                <span
                  className="text-xs font-mono px-2 py-0.5 rounded-full"
                  style={{
                    background: isSel
                      ? "rgba(0,180,255,0.2)"
                      : urgent
                      ? "rgba(220,50,50,0.2)"
                      : "rgba(255,255,255,0.06)",
                    color: isSel
                      ? "#00d4ff"
                      : urgent
                      ? "#f87171"
                      : "rgba(160,180,210,0.7)",
                  }}
                >
                  {cd}
                </span>

                {/* Days-bar at bottom */}
                <div className="w-full h-0.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, (days / 30) * 100)}%`,
                      background: isSel
                        ? "linear-gradient(to right, rgba(0,180,255,0.6), rgba(0,212,255,0.9))"
                        : "rgba(100,140,200,0.3)",
                    }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer nav */}
      <div
        className="flex items-center gap-1 px-2 py-1"
        style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
      >
        <button
          onClick={() => scrollRef.current?.scrollBy({ left: -300, behavior: "smooth" })}
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded text-gray-600 hover:text-gray-200 hover:bg-white/8 transition-colors"
          aria-label="Scroll left"
        >
          ‹
        </button>
        <p className="flex-1 text-xs text-center" style={{ color: "rgba(100,130,170,0.40)" }}>
          Longer expiry → more time · Higher premium
        </p>
        <button
          onClick={() => scrollRef.current?.scrollBy({ left: 300, behavior: "smooth" })}
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded text-gray-600 hover:text-gray-200 hover:bg-white/8 transition-colors"
          aria-label="Scroll right"
        >
          ›
        </button>
      </div>
    </div>
  );
}

