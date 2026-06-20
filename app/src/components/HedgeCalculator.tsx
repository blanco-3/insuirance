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

// Approximate premium fraction for sparkline (no API needed — √T proxy)
function approxPremiumFraction(expiryMs: number): number {
  const T = Math.max(0, (expiryMs - Date.now()) / (365.25 * 24 * 3600 * 1000));
  return Math.sqrt(T) * 0.30;
}

function MiniSparkline({ oracles }: { oracles: OracleInfo[] }) {
  if (oracles.length < 2) return null;

  const W = 300;
  const H = 44;
  const PX = 16;
  const PY = 8;

  const fracs = oracles.map((o) => approxPremiumFraction(o.expiry));
  const maxF = Math.max(...fracs, 0.001);

  const pts = fracs.map((f, i) => ({
    x: PX + (i / (oracles.length - 1)) * (W - PX * 2),
    y: H - PY - (f / maxF) * (H - PY * 2),
  }));

  function curvePath(ps: { x: number; y: number }[]) {
    let d = `M${ps[0].x},${ps[0].y}`;
    for (let i = 1; i < ps.length; i++) {
      const cpX = (ps[i - 1].x + ps[i].x) / 2;
      d += ` C${cpX},${ps[i - 1].y} ${cpX},${ps[i].y} ${ps[i].x},${ps[i].y}`;
    }
    return d;
  }

  const line = curvePath(pts);
  const area = `${line} L${pts[pts.length - 1].x},${H} L${pts[0].x},${H} Z`;

  return (
    <div className="rounded-lg overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 44, display: "block" }}>
        <defs>
          <linearGradient id="hcg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(42,212,255,0.18)" />
            <stop offset="100%" stopColor="rgba(42,212,255,0.02)" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#hcg)" />
        <path d={line} stroke="rgba(42,212,255,0.7)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="rgba(42,212,255,0.7)" />
        ))}
        <text x={PX} y={H - 3} fontSize={6.5} fill="rgba(150,160,200,0.4)" fontFamily="monospace">near expiry</text>
        <text x={W - PX - 40} y={H - 3} fontSize={6.5} fill="rgba(150,160,200,0.4)" fontFamily="monospace">far expiry</text>
        <text x={W / 2 - 28} y={10} fontSize={6.5} fill="rgba(150,160,200,0.35)" fontFamily="monospace">premium curve ↑</text>
      </svg>
    </div>
  );
}

export function HedgeCalculator({ onHedge }: Props) {
  const [btcAmount, setBtcAmount] = useState("");
  const [spot, setSpot] = useState<bigint | null>(null);
  const [oracles, setOracles] = useState<OracleInfo[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    getActiveOracles()
      .then(async (list) => {
        setOracles(list);
        if (!list[0]) return;
        const p = await getOraclePrice(list[0].id);
        setSpot(BigInt(p.spot));
      })
      .catch(() => {});
  }, []);

  const btc = parseFloat(btcAmount || "0");
  const btcPriceUsd = spot ? Number(spot) / 1_000_000_000 : 0;
  const portfolioUsd = btc * btcPriceUsd;

  const scenarios = [
    { label: "5% drop",  pct: 0.05 },
    { label: "10% drop", pct: 0.10 },
    { label: "20% drop", pct: 0.20 },
  ];

  const recommendedCover = portfolioUsd > 0
    ? Math.ceil(portfolioUsd * 0.10)
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

      {/* Premium term structure sparkline */}
      {oracles.length >= 2 && <MiniSparkline oracles={oracles} />}

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
              <div>
                <p className="text-sm font-semibold text-amber-300">
                  ${portfolioUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })} unprotected
                </p>
                <p className="text-xs text-amber-500 mt-0.5">
                  Consider at least <span className="font-mono font-bold">{recommendedCover} DUSDC</span> of Full Ladder coverage
                </p>
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
