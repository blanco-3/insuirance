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
  formatExpiry,
  getOraclePrice,
  getActiveOracles,
  type OracleInfo,
  type OraclePrice,
} from "@/lib/predict-api";

const INSUIRANCE_PACKAGE = process.env.NEXT_PUBLIC_INSUIRANCE_PACKAGE ?? "";
const CLOCK_ID = "0x6";
const MANAGER_KEY = (addr: string) => `managerId_${addr}`;

const DROP_OPTIONS = [
  { label: "5% drop", bps: 500n },
  { label: "10% drop", bps: 1000n },
  { label: "20% drop", bps: 2000n },
];


interface Props {
  address: string;
}

export function CoverForm({ address }: Props) {
  const { mutateAsync: signAndExecute, isPending } = useSignAndExecuteTransaction();
  const client = useSuiClient();

  // Manager state
  const [managerId, setManagerId] = useState<string | null>(null);
  const [managerBalance, setManagerBalance] = useState<bigint | null>(null);
  const [loadingManager, setLoadingManager] = useState(true);

  // Market data
  const [oracles, setOracles] = useState<OracleInfo[]>([]);
  const [price, setPrice] = useState<OraclePrice | null>(null);
  const [loadingPrice, setLoadingPrice] = useState(true);

  // Form state
  const [dropBps, setDropBps] = useState(500n);
  const [oracleOption, setOracleOption] = useState<OracleInfo | null>(null);
  const [coverAmount, setCoverAmount] = useState("5");
  const [depositAmount, setDepositAmount] = useState("5");

  // UI state
  const [txDigest, setTxDigest] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"buy" | "deposit">("buy");

  // dUSDC wallet balance
  const { data: dusdcCoins, refetch: refetchCoins } = useSuiClientQuery(
    "getCoins",
    { owner: address, coinType: DUSDC_TYPE },
    { refetchInterval: 15_000 }
  );
  const walletCoins = dusdcCoins?.data ?? [];
  const walletBalance = walletCoins.reduce((s, c) => s + BigInt(c.balance), 0n);

  // Read manager dUSDC balance directly on-chain via devInspect
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
      // u64 little-endian
      let val = 0n;
      for (let i = 7; i >= 0; i--) val = val * 256n + BigInt(bytes[i]);
      return val;
    },
    [address, client]
  );

  // Load manager from localStorage, then verify on-chain
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
      // Fallback: query events for PredictManagerCreated by this address
      const events = await client.queryEvents({
        query: {
          MoveEventType: `${PREDICT_PACKAGE}::predict_manager::PredictManagerCreated`,
        },
        limit: 50,
        order: "descending",
      });
      const found = events.data.find(
        (e) => (e.parsedJson as any)?.owner === address
      );
      if (found) {
        const id = (found.parsedJson as any)?.manager_id as string;
        const normalized = id.startsWith("0x") ? id : `0x${id}`;
        localStorage.setItem(MANAGER_KEY(address), normalized);
        setManagerId(normalized);
        setManagerBalance(await fetchOnChainBalance(normalized));
      }
    } catch {
      // ignore
    } finally {
      setLoadingManager(false);
    }
  }, [address, client, fetchOnChainBalance]);

  useEffect(() => {
    loadManager();
  }, [loadManager]);

  // Load active oracles on mount
  useEffect(() => {
    getActiveOracles()
      .then((list) => {
        setOracles(list);
        if (list.length > 0) setOracleOption(list[0]);
      })
      .catch(() => {});
  }, []);

  // Fetch price for selected oracle
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

  const spotRaw = price ? BigInt(price.spot) : 0n;
  const strike = spotRaw > 0n ? computeStrike(spotRaw, dropBps) : 0n;
  const coverRaw = BigInt(Math.round(parseFloat(coverAmount || "0") * 1_000_000));
  const depositRaw = BigInt(Math.round(parseFloat(depositAmount || "0") * 1_000_000));
  // max_premium slippage guard: 20% of cover amount (binary options cost << notional)
  const maxPremium = (coverRaw * 20n) / 100n;

  async function handleCreateManager() {
    setError(null);
    setTxDigest(null);
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PREDICT_PACKAGE}::predict::create_manager`,
        arguments: [],
      });
      const result = await signAndExecute({ transaction: tx });

      // Fetch tx to find manager ID from event
      const fullTx = await client.getTransactionBlock({
        digest: result.digest,
        options: { showEvents: true },
      });
      const event = fullTx.events?.find((e) =>
        e.type.includes("PredictManagerCreated")
      );
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
      setError(e.message ?? "Transaction failed");
    }
  }

  async function handleDeposit() {
    if (!managerId) return;
    setError(null);
    setTxDigest(null);

    if (depositRaw === 0n) { setError("Enter deposit amount"); return; }
    if (depositRaw > walletBalance) { setError("Insufficient dUSDC in wallet"); return; }

    try {
      const tx = new Transaction();

      // Merge all coins into the first if needed
      if (walletCoins.length > 1) {
        tx.mergeCoins(
          tx.object(walletCoins[0].coinObjectId),
          walletCoins.slice(1).map((c) => tx.object(c.coinObjectId))
        );
      }
      const [coin] = tx.splitCoins(tx.object(walletCoins[0].coinObjectId), [
        tx.pure.u64(depositRaw),
      ]);
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
      setError(e.message ?? "Deposit failed");
    }
  }

  async function handleBuyCover() {
    if (!managerId) { setError("Set up a manager first"); return; }
    if (!INSUIRANCE_PACKAGE) { setError("Package not configured"); return; }
    if (!oracleOption) { setError("No active oracle available"); return; }
    if (coverRaw === 0n) { setError("Enter cover amount"); return; }
    if (managerBalance !== null && maxPremium > managerBalance) {
      setError("Insufficient manager balance — deposit more dUSDC first");
      return;
    }
    setError(null);
    setTxDigest(null);

    try {
      const tx = new Transaction();
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
          tx.pure.vector("u8", Array.from(new TextEncoder().encode("BTC"))),
          tx.object(CLOCK_ID),
        ],
      });
      tx.transferObjects([policy], address);

      const result = await signAndExecute({ transaction: tx });
      setTxDigest(result.digest);
      setManagerBalance(await fetchOnChainBalance(managerId));
    } catch (e: any) {
      setError(e.message ?? "Transaction failed");
    }
  }

  if (loadingManager) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-gray-400">
        Loading…
      </div>
    );
  }

  // Step 1: No manager yet
  if (!managerId) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-lg">Set Up Your Account</h2>
          <p className="text-sm text-gray-400 mt-1">
            Create a PredictManager to start buying cover. One-time setup.
          </p>
        </div>
        {error && (
          <p className="text-sm text-red-400 bg-red-950/30 border border-red-800/40 rounded-lg px-4 py-2">
            {error}
          </p>
        )}
        {txDigest && (
          <p className="text-sm text-green-400">Done! tx: {txDigest.slice(0, 16)}…</p>
        )}
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
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-5">
      {/* Manager balance bar */}
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
              type="number"
              min="0.01"
              step="0.01"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              className="flex-1 bg-transparent px-3 py-2 text-sm text-white focus:outline-none"
              placeholder="5"
            />
            <span className="flex items-center pr-3 text-sm text-gray-400">DUSDC</span>
          </div>
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
          {txDigest && (
            <p className="text-sm text-green-400">Deposited! tx: {txDigest.slice(0, 16)}…</p>
          )}
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
          {/* BTC price */}
          <div className="flex items-center justify-between text-sm border-t border-white/10 pt-4">
            <span className="text-gray-400">BTC Spot</span>
            <span className="font-mono font-semibold">
              {loadingPrice ? "Loading…" : price ? formatUsd(BigInt(price.spot)) : "—"}
            </span>
          </div>

          {/* Drop selector */}
          <div className="space-y-2">
            <label className="text-sm text-gray-400">Coverage Trigger</label>
            <div className="flex gap-2">
              {DROP_OPTIONS.map((o) => (
                <button
                  key={o.bps.toString()}
                  onClick={() => setDropBps(o.bps)}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium border transition-colors ${
                    dropBps === o.bps
                      ? "bg-blue-600 border-blue-500 text-white"
                      : "border-white/10 bg-white/5 text-gray-300 hover:bg-white/10"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {strike > 0n && (
              <p className="text-xs text-gray-500">
                Pays out if BTC settles at or below{" "}
                <span className="text-white font-mono">{formatUsd(strike)}</span>
              </p>
            )}
          </div>

          {/* Expiry */}
          {oracles.length > 0 ? (
            <div className="space-y-2">
              <label className="text-sm text-gray-400">Expiry</label>
              <select
                value={oracleOption?.id ?? ""}
                onChange={(e) => {
                  const opt = oracles.find((o) => o.id === e.target.value);
                  if (opt) setOracleOption(opt);
                }}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                {oracles.map((o) => (
                  <option key={o.id} value={o.id} className="bg-gray-900">
                    {o.underlying_asset} · {formatExpiry(o.expiry)}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p className="text-sm text-yellow-500">Loading oracles…</p>
          )}

          {/* Cover amount */}
          <div className="space-y-2">
            <label className="text-sm text-gray-400">Cover Amount</label>
            <div className="flex rounded-lg border border-white/10 bg-white/5 overflow-hidden">
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={coverAmount}
                onChange={(e) => setCoverAmount(e.target.value)}
                className="flex-1 bg-transparent px-3 py-2 text-sm text-white focus:outline-none"
                placeholder="5"
              />
              <span className="flex items-center pr-3 text-sm text-gray-400">DUSDC</span>
            </div>
          </div>

          {/* Summary */}
          {coverRaw > 0n && strike > 0n && (
            <div className="rounded-lg bg-blue-950/40 border border-blue-800/40 p-4 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Strike</span>
                <span className="font-mono">{formatUsd(strike)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Max Premium</span>
                <span className="font-mono">{formatDusdc(maxPremium)}</span>
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
          <p className="font-semibold">Cover purchased!</p>
          <p className="font-mono text-xs break-all">{txDigest}</p>
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
            (managerBalance !== null && managerBalance === 0n)
          }
          className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed py-3 font-semibold transition-colors"
        >
          {isPending
            ? "Signing…"
            : managerBalance !== null && managerBalance === 0n
            ? "Deposit dUSDC first"
            : "Buy Cover"}
        </button>
      )}

      <p className="text-xs text-gray-600 text-center">
        Powered by DeepBook Predict · Sui Testnet
      </p>
    </div>
  );
}
