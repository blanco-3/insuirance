"use client";

import { useState, useEffect } from "react";
import {
  getActiveOracles,
  getOraclePrice,
  formatUsd,
  type OracleInfo,
} from "@/lib/predict-api";

interface Props {
  onHedge?: (coverAmount: string) => void;
}

export function HedgeCalculator({ onHedge }: Props) {
  const [btcAmount, setBtcAmount] = useState("");
  const [spot, setSpot] = useState<bigint | null>(null);
  const [oracle, setOracle] = useState<OracleInfo | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    getActiveOracles()
      .then(async (list) => {
        if (!list[0]) return;
        setOracle(list[0]);
        const p = await getOraclePrice(list[0].id);
        setSpot(BigInt(p.spot));
      })
      .catch(() => {});
  }, []);

  const btc = parseFloat(btcAmount || "0");
  const spotUsd = spot ? Number(spot) / 1_000_000_000 : 0; // oracle units → USD per BTC (each unit = $0.001... wait)

  // oracle units: 1e9 = $1,000 → spot in oracle units / 1e9 = price in thousands
  // Actually: spot is in units where 1e12 = $1,000,000 → spot/1e9 = price in USD
  const btcPriceUsd = spot ? Number(spot) / 1_000_000_000 : 0;
  const portfolioUsd = btc * btcPriceUsd;

  const scenarios = [
    { label: "5% drop", pct: 0.05, trigger: "5%" },
    { label: "10% drop", pct: 0.10, trigger: "10%" },
    { label: "20% drop", pct: 0.20, trigger: "20%" },
  ];

  const recommendedCover = portfolioUsd > 0
    ? Math.ceil(portfolioUsd * 0.10) // 10% of portfolio, rounded up to nearest 1
    : 0;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl border border-dashed border-white/20 bg-white/[0.02] hover:bg-white/5 px-6 py-4 text-left transition-colors group"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white group-hover:text-blue-300 transition-colors">
              How exposed is your BTC portfolio?
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Calculate your downside risk in seconds
            </p>
          </div>
          <span className="text-gray-500 text-lg">→</span>
        </div>
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-blue-500/30 bg-blue-950/20 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-white">Exposure Calculator</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {spot ? `BTC @ ${formatUsd(spot)}` : "Loading price…"}
          </p>
        </div>
        <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-white text-sm">✕</button>
      </div>

      <div className="flex rounded-lg border border-white/10 bg-white/5 overflow-hidden">
        <input
          type="number"
          min="0"
          step="0.001"
          value={btcAmount}
          onChange={(e) => setBtcAmount(e.target.value)}
          className="flex-1 bg-transparent px-3 py-2.5 text-sm text-white focus:outline-none"
          placeholder="How much BTC do you hold?"
          autoFocus
        />
        <span className="flex items-center pr-3 text-sm text-gray-400 font-mono">BTC</span>
      </div>

      {btc > 0 && portfolioUsd > 0 && (
        <>
          <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Portfolio Value</span>
              <span className="font-mono font-bold text-white">
                ${portfolioUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="space-y-2 pt-2 border-t border-white/10">
              {scenarios.map((s) => {
                const loss = portfolioUsd * s.pct;
                return (
                  <div key={s.label} className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">{s.label}</span>
                    <span className="font-mono text-red-400">
                      −${loss.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {recommendedCover > 0 && (
            <div className="rounded-xl bg-amber-950/40 border border-amber-700/40 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <span className="text-amber-400 text-lg">⚠️</span>
                <div>
                  <p className="text-sm font-semibold text-amber-300">
                    ${portfolioUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })} unprotected
                  </p>
                  <p className="text-xs text-amber-500 mt-0.5">
                    Consider at least <span className="font-mono font-bold">{recommendedCover} DUSDC</span> of Full Ladder coverage
                  </p>
                </div>
              </div>
              {onHedge && (
                <button
                  onClick={() => { onHedge(String(recommendedCover)); setOpen(false); }}
                  className="w-full rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm py-2 transition-colors"
                >
                  Protect Now → {recommendedCover} DUSDC
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
