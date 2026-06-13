"use client";

import { useState, useEffect, useCallback } from "react";
import { useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import {
  PREDICT_ID,
  PREDICT_PACKAGE,
  REGISTRY_ID,
  DUSDC_TYPE,
  DEMO_ORACLE_ID,
  BTC_ORACLES,
  computeStrike,
  formatUsd,
  formatDusdc,
  getOraclePrice,
  getVaultSummary,
  type OraclePrice,
  type VaultSummary,
} from "@/lib/predict-api";

const INSUIRANCE_PACKAGE = process.env.NEXT_PUBLIC_INSUIRANCE_PACKAGE ?? "";

// Drop % options shown to user
const DROP_OPTIONS = [
  { label: "5% drop", bps: 500n },
  { label: "10% drop", bps: 1000n },
  { label: "20% drop", bps: 2000n },
];

// Oracle expiry options (pick nearest active)
const ORACLE_OPTIONS = Object.entries(BTC_ORACLES).map(([date, id]) => ({
  label: `Expires ${date}`,
  id,
  expiry: new Date(date + "T08:00:00Z").getTime(),
}));

interface Props {
  address: string;
}

export function CoverForm({ address }: Props) {
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction();

  const [price, setPrice] = useState<OraclePrice | null>(null);
  const [vault, setVault] = useState<VaultSummary | null>(null);
  const [loadingPrice, setLoadingPrice] = useState(true);

  const [dropBps, setDropBps] = useState(500n);
  const [oracleOption, setOracleOption] = useState(ORACLE_OPTIONS[1]); // D+9 default
  const [coverAmount, setCoverAmount] = useState("100"); // DUSDC
  const [slippage, setSlippage] = useState(2); // 2%

  const [txDigest, setTxDigest] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchMarketData = useCallback(async () => {
    setLoadingPrice(true);
    try {
      const [p, v] = await Promise.all([
        getOraclePrice(DEMO_ORACLE_ID),
        getVaultSummary(),
      ]);
      setPrice(p);
      setVault(v);
    } catch (e) {
      console.error("Market data fetch failed:", e);
    } finally {
      setLoadingPrice(false);
    }
  }, []);

  useEffect(() => {
    fetchMarketData();
    const interval = setInterval(fetchMarketData, 15_000);
    return () => clearInterval(interval);
  }, [fetchMarketData]);

  const spotRaw = price ? BigInt(price.spot) : 0n;
  const strike = spotRaw > 0n ? computeStrike(spotRaw, dropBps) : 0n;
  const askRaw = price ? BigInt(price.ask) : 0n;

  // quantity in DUSDC raw (decimals 6)
  const quantityRaw = BigInt(Math.round(parseFloat(coverAmount || "0") * 1_000_000));

  // estimated premium = ask * quantity / 1e6 * (1 + slippage%)
  const estimatedPremiumRaw =
    quantityRaw > 0n && askRaw > 0n
      ? (askRaw * quantityRaw * BigInt(100 + slippage)) / (100n * 1_000_000n)
      : 0n;

  async function handleBuyCover() {
    if (!INSUIRANCE_PACKAGE) {
      setError("Package not deployed yet — set NEXT_PUBLIC_INSUIRANCE_PACKAGE");
      return;
    }
    if (quantityRaw === 0n) {
      setError("Enter a cover amount");
      return;
    }
    setError(null);

    const tx = new Transaction();

    // buy_cover<DUSDC>(predict, manager, oracle, strike, expiry, quantity, max_premium, asset, clock, ctx)
    tx.moveCall({
      target: `${INSUIRANCE_PACKAGE}::policy::buy_cover`,
      typeArguments: [DUSDC_TYPE],
      arguments: [
        tx.object(PREDICT_ID),
        tx.object(REGISTRY_ID), // manager — caller must pass their own PredictManager
        tx.object(oracleOption.id),
        tx.pure.u64(strike),
        tx.pure.u64(BigInt(oracleOption.expiry)),
        tx.pure.u64(quantityRaw),
        tx.pure.u64(estimatedPremiumRaw),
        tx.pure.vector("u8", Array.from(new TextEncoder().encode("BTC"))),
        tx.object("0x6"), // Clock
      ],
    });

    signAndExecute(
      { transaction: tx },
      {
        onSuccess: (result) => {
          setTxDigest(result.digest);
        },
        onError: (err) => {
          setError(err.message);
        },
      }
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-left space-y-6">
      {/* Market data bar */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-400">BTC Spot</span>
        <span className="font-mono font-semibold">
          {loadingPrice ? "Loading…" : price ? formatUsd(BigInt(price.spot)) : "—"}
        </span>
      </div>

      {vault && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Vault Liquidity</span>
          <span className="font-mono">{formatDusdc(vault.available_liquidity)}</span>
        </div>
      )}

      <hr className="border-white/10" />

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

      {/* Expiry selector */}
      <div className="space-y-2">
        <label className="text-sm text-gray-400">Expiry</label>
        <select
          value={oracleOption.id}
          onChange={(e) => {
            const opt = ORACLE_OPTIONS.find((o) => o.id === e.target.value);
            if (opt) setOracleOption(opt);
          }}
          className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
        >
          {ORACLE_OPTIONS.map((o) => (
            <option key={o.id} value={o.id} className="bg-gray-900">
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Cover amount */}
      <div className="space-y-2">
        <label className="text-sm text-gray-400">Cover Amount (DUSDC)</label>
        <div className="flex rounded-lg border border-white/10 bg-white/5 overflow-hidden">
          <input
            type="number"
            min="1"
            value={coverAmount}
            onChange={(e) => setCoverAmount(e.target.value)}
            className="flex-1 bg-transparent px-3 py-2 text-sm text-white focus:outline-none"
            placeholder="100"
          />
          <span className="flex items-center pr-3 text-sm text-gray-400">DUSDC</span>
        </div>
      </div>

      {/* Premium estimate */}
      {estimatedPremiumRaw > 0n && (
        <div className="rounded-lg bg-blue-950/40 border border-blue-800/40 p-4 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Est. Premium</span>
            <span className="font-mono">{formatDusdc(estimatedPremiumRaw)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Strike</span>
            <span className="font-mono">{strike > 0n ? formatUsd(strike) : "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Slippage Guard</span>
            <span className="font-mono">+{slippage}%</span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-sm text-red-400 bg-red-950/30 border border-red-800/40 rounded-lg px-4 py-2">
          {error}
        </p>
      )}

      {/* Success */}
      {txDigest && (
        <div className="text-sm text-green-400 bg-green-950/30 border border-green-800/40 rounded-lg px-4 py-2 space-y-1">
          <p className="font-semibold">Cover purchased!</p>
          <p className="font-mono text-xs break-all">{txDigest}</p>
        </div>
      )}

      {/* Buy button */}
      <button
        onClick={handleBuyCover}
        disabled={isPending || loadingPrice || quantityRaw === 0n}
        className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed py-3 font-semibold text-white transition-colors"
      >
        {isPending ? "Signing…" : "Buy Cover"}
      </button>

      <p className="text-xs text-gray-600 text-center">
        Powered by DeepBook Predict · Sui Testnet
      </p>
    </div>
  );
}
