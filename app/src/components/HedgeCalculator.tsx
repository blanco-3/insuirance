"use client";

import { useState, useEffect } from "react";
import {
  getActiveOracles,
  getOraclePrice,
  formatUsd,
  type OracleInfo,
} from "@/lib/predict-api";

type Asset = "BTC" | "SUI";

interface Props {
  onHedge?: (coverAmount: string, asset: Asset) => void;
  onAssetChange?: (asset: Asset) => void;
}

// Approximate premium fraction for sparkline (no API needed — √T proxy)
function approxPremiumFraction(expiryMs: number): number {
  const T = Math.max(0, (expiryMs - Date.now()) / (365.25 * 24 * 3600 * 1000));
  return Math.sqrt(T) * 0.30;
}

function MiniSparkline({ oracles, asset }: { oracles: OracleInfo[]; asset: Asset }) {
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

  const isBtc = asset === "BTC";
  const accent = isBtc ? "rgba(251,146,60,0.85)" : "rgba(167,139,250,0.85)";
  const fill1  = isBtc ? "rgba(251,146,60,0.18)" : "rgba(167,139,250,0.18)";
  const fill2  = isBtc ? "rgba(251,146,60,0.02)" : "rgba(167,139,250,0.02)";
  const gradId = `hcg-${asset}`;

  return (
    <div className="rounded-lg overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 44, display: "block" }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={fill1} />
            <stop offset="100%" stopColor={fill2} />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradId})`} />
        <path d={line} stroke={accent} strokeWidth="1.5" fill="none" strokeLinecap="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2.5} fill={accent} />
        ))}
        <text x={PX} y={H - 3} fontSize={6.5} fill="rgba(150,160,200,0.4)" fontFamily="monospace">near expiry</text>
        <text x={W - PX - 40} y={H - 3} fontSize={6.5} fill="rgba(150,160,200,0.4)" fontFamily="monospace">far expiry</text>
        <text x={W / 2 - 28} y={10} fontSize={6.5} fill="rgba(150,160,200,0.35)" fontFamily="monospace">premium curve ↑</text>
      </svg>
    </div>
  );
}

export function HedgeCalculator({ onHedge, onAssetChange }: Props) {
  const [asset, setAsset] = useState<Asset>("BTC");
  const [amount, setAmount] = useState("");
  const [spot, setSpot] = useState<bigint | null>(null);
  const [assetOracles, setAssetOracles] = useState<OracleInfo[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setSpot(null);
    getActiveOracles()
      .then(async (list) => {
        const filtered = list.filter((o) =>
          o.underlying_asset.toUpperCase().includes(asset)
        );
        setAssetOracles(filtered);
        if (!filtered[0]) return;
        const p = await getOraclePrice(filtered[0].id);
        setSpot(BigInt(p.spot));
      })
      .catch(() => {});
  }, [asset]);

  function switchAsset(a: Asset) {
    setAsset(a);
    setAmount("");
    onAssetChange?.(a);
  }

  const qty = parseFloat(amount || "0");
  const priceUsd = spot ? Number(spot) / 1_000_000_000 : 0;
  const portfolioUsd = qty * priceUsd;

  const scenarios = [
    { label: "5% drop",  pct: 0.05 },
    { label: "10% drop", pct: 0.10 },
    { label: "20% drop", pct: 0.20 },
  ];

  const recommendedCover = portfolioUsd > 0
    ? Math.ceil(portfolioUsd * 0.10)
    : 0;

  const isBtc   = asset === "BTC";
  const accent  = isBtc ? "#fb923c" : "#a78bfa";
  const border  = isBtc ? "rgba(251,146,60,0.28)" : "rgba(167,139,250,0.28)";
  const bg      = isBtc ? "rgba(251,146,60,0.05)" : "rgba(167,139,250,0.05)";

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl border border-dashed border-white/20 bg-white/[0.02] hover:bg-white/5 px-6 py-4 text-left transition-colors group"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white group-hover:text-blue-300 transition-colors">
              How exposed is your portfolio?
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Calculate BTC or SUI downside risk in seconds
            </p>
          </div>
          <span className="text-gray-500 text-lg">→</span>
        </div>
      </button>
    );
  }

  return (
    <div className="rounded-2xl border p-6 space-y-4 transition-colors" style={{ borderColor: border, background: bg }}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-white">Exposure Calculator</h3>
        <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-white text-sm">✕</button>
      </div>

      {/* Asset selector */}
      <div className="flex rounded-lg border border-white/10 bg-white/5 p-0.5 gap-0.5">
        {(["BTC", "SUI"] as Asset[]).map((a) => {
          const isActive = asset === a;
          const btnAccent = a === "BTC" ? "#fb923c" : "#a78bfa";
          const btnBg     = a === "BTC" ? "rgba(251,146,60,0.18)" : "rgba(167,139,250,0.18)";
          return (
            <button
              key={a}
              onClick={() => switchAsset(a)}
              className="flex-1 rounded-md py-1.5 text-sm font-semibold transition-all"
              style={isActive
                ? { background: btnBg, color: btnAccent }
                : { color: "rgba(140,140,170,0.55)" }
              }
            >
              {a}
            </button>
          );
        })}
      </div>

      {/* Price */}
      <p className="text-xs" style={{ color: "rgba(160,160,200,0.5)" }}>
        {spot ? `${asset} @ ${formatUsd(spot)}` : "Loading price…"}
      </p>

      {/* Amount input */}
      <div className="flex rounded-lg border border-white/10 bg-white/5 overflow-hidden">
        <input
          type="number"
          min="0"
          step={isBtc ? "0.001" : "1"}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="flex-1 bg-transparent px-3 py-2.5 text-sm text-white focus:outline-none"
          placeholder={`How much ${asset} do you hold?`}
          autoFocus
        />
        <span className="flex items-center pr-3 text-sm text-gray-400 font-mono">{asset}</span>
      </div>

      {/* Premium term structure sparkline */}
      {assetOracles.length >= 2 && (
        <MiniSparkline oracles={assetOracles} asset={asset} />
      )}

      {qty > 0 && portfolioUsd > 0 && (
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
            <div className="rounded-xl p-4 space-y-3" style={{ background: "rgba(250,150,30,0.07)", border: "1px solid rgba(250,150,30,0.22)" }}>
              <div>
                <p className="text-sm font-semibold text-amber-300">
                  ${portfolioUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })} unprotected
                </p>
                <p className="text-xs text-amber-500/70 mt-0.5">
                  Consider at least <span className="font-mono font-bold">{recommendedCover} DUSDC</span> of Full Ladder coverage
                </p>
              </div>
              {onHedge && (
                <button
                  onClick={() => { onHedge(String(recommendedCover), asset); setOpen(false); }}
                  className="w-full rounded-lg text-black font-semibold text-sm py-2 transition-colors hover:opacity-90"
                  style={{ background: accent }}
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
