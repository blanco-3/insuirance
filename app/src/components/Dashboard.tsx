"use client";

import { useEffect, useRef, useState } from "react";
import { useSuiClient, useSuiClientQuery } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import {
  PREDICT_PACKAGE,
  DUSDC_TYPE,
  formatDusdc,
  formatUsd,
  getVaultSummary,
  getActiveOracles,
  getOraclePrice,
  type VaultSummary,
  type OracleInfo,
} from "@/lib/predict-api";

// Re-read from env directly for Dashboard since predict-api doesn't export it
const INSUIRANCE_PKG = process.env.NEXT_PUBLIC_INSUIRANCE_PACKAGE ?? "";

// ── BTC sparkline ─────────────────────────────────────────────────────────────

const SPARK_W = 400;
const SPARK_H = 64;
const SPARK_PAD = 8;

function buildSparkPath(prices: number[]) {
  const midY = SPARK_H / 2;
  if (prices.length < 2) {
    return {
      line:  `M${SPARK_PAD},${midY} L${SPARK_W - SPARK_PAD},${midY}`,
      area:  `M${SPARK_PAD},${midY} L${SPARK_W - SPARK_PAD},${midY} L${SPARK_W - SPARK_PAD},${SPARK_H} L${SPARK_PAD},${SPARK_H} Z`,
      lastX: SPARK_W - SPARK_PAD,
      lastY: midY,
    };
  }
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const pts = prices.map((p, i) => ({
    x: SPARK_PAD + (i / (prices.length - 1)) * (SPARK_W - SPARK_PAD * 2),
    y: SPARK_PAD + (1 - (p - min) / range) * (SPARK_H - SPARK_PAD * 2),
  }));

  const line = pts.map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  const area = `${line} L${last.x.toFixed(1)},${SPARK_H} L${SPARK_PAD},${SPARK_H} Z`;

  return { line, area, lastX: last.x, lastY: last.y };
}

interface OraclePriceChartProps {
  oracleId: string;
  asset: string;
  initialFormatted: string;
}

function toBinanceStream(asset: string): string | null {
  const a = asset.toLowerCase().replace(/[^a-z]/g, "");
  if (a === "btc") return "btcusdt@trade";
  if (a === "eth") return "ethusdt@trade";
  return null;
}

function OraclePriceChart({ oracleId, asset, initialFormatted }: OraclePriceChartProps) {
  const [prices,    setPrices]    = useState<number[]>([]);
  const [display,   setDisplay]   = useState(initialFormatted);
  const [changePct, setChangePct] = useState(0);
  const [isLive,    setIsLive]    = useState(false);
  const pricesRef    = useRef<number[]>([]);
  const firstRef     = useRef<number | null>(null);
  const lastTickRef  = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    function push(priceUsd: number) {
      if (cancelled) return;
      const now = Date.now();
      if (now - lastTickRef.current < 500) return;
      lastTickRef.current = now;
      const raw  = Math.round(priceUsd * 1_000_000);
      const next = [...pricesRef.current, raw].slice(-120);
      pricesRef.current = next;
      if (firstRef.current === null) firstRef.current = raw;
      const pct = firstRef.current ? (raw - firstRef.current) / firstRef.current * 100 : 0;
      setDisplay("$" + priceUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      setPrices([...next]);
      setChangePct(pct);
    }

    function startOraclePoll() {
      async function poll() {
        if (cancelled) return;
        try {
          const p = await getOraclePrice(oracleId);
          if (!cancelled) push(Number(BigInt(p.spot)) / 1_000_000);
        } catch {}
      }
      poll();
      pollTimer = setInterval(poll, 5_000);
    }

    const stream = toBinanceStream(asset);
    if (stream) {
      try {
        ws = new WebSocket(`wss://stream.binance.com:9443/ws/${stream}`);
        ws.onopen    = () => { if (!cancelled) setIsLive(true); };
        ws.onmessage = (evt) => { push(parseFloat(JSON.parse(evt.data).p)); };
        ws.onerror   = () => { if (!cancelled) { setIsLive(false); startOraclePoll(); } };
        ws.onclose   = () => { if (!cancelled) { setIsLive(false); startOraclePoll(); } };
      } catch {
        startOraclePoll();
      }
    } else {
      startOraclePoll();
    }

    return () => {
      cancelled = true;
      ws?.close();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [oracleId, asset]);

  const { line, area, lastX, lastY } = buildSparkPath(prices);
  const up = changePct >= 0;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "rgba(4,14,30,.65)", border: "1px solid rgba(96,165,222,.12)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-0">
        <div>
          <p className="text-xs uppercase tracking-wider" style={{ color: "rgba(120,160,200,.5)" }}>
            {asset} / USD
          </p>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span key={display} className="text-2xl font-bold font-mono price-update">{display}</span>
            {prices.length >= 2 && (
              <span className={`font-mono text-xs ${up ? "text-green-400" : "text-red-400"}`}>
                {up ? "+" : ""}{changePct.toFixed(3)}%
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 pb-1">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: isLive ? "#2ad4ff" : "#94a3b8",
              boxShadow: isLive ? "0 0 5px #2ad4ff" : "none",
              animation: isLive ? "pulse 2s ease-in-out infinite" : "none",
            }}
          />
          <span className="font-mono text-xs" style={{ color: isLive ? "rgba(42,212,255,.6)" : "rgba(148,163,184,.5)" }}>
            {isLive ? "LIVE" : "5s"}
          </span>
        </div>
      </div>

      {/* Sparkline */}
      <svg
        viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: SPARK_H, display: "block" }}
      >
        <defs>
          <linearGradient id="dsFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="rgba(42,212,255,.14)" />
            <stop offset="100%" stopColor="rgba(42,212,255,.01)" />
          </linearGradient>
          <linearGradient id="dsLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="rgba(42,212,255,.25)" />
            <stop offset="100%" stopColor="rgba(42,212,255,.9)" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#dsFill)" />
        <path d={line} stroke="url(#dsLine)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={lastX} cy={lastY} r="3" fill="#2ad4ff" />
        <circle cx={lastX} cy={lastY} r="3" fill="none" stroke="rgba(42,212,255,.3)" strokeWidth="5">
          <animate attributeName="r" values="3;7;3" dur="2.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="1;0;1" dur="2.5s" repeatCount="indefinite" />
        </circle>
      </svg>

      {/* Footer */}
      <p className="text-right px-3 pb-2 font-mono" style={{ fontSize: 9, color: "rgba(120,165,210,.28)", letterSpacing: "0.06em" }}>
        {isLive ? "Binance spot · real-time" : "DeepBook oracle · 5s"}
      </p>
    </div>
  );
}
const MANAGER_KEY = (addr: string) => `managerId_${addr}`;

interface Props {
  address: string;
}

interface OracleWithPrice extends OracleInfo {
  spotFormatted: string;
  spotRaw: bigint;
}

interface RecentEvent {
  id: string;
  buyer: string;
  asset: string;
  timestampMs: string | null;
}

const SUI_GAS_WARN_THRESHOLD = 50_000_000n; // 0.05 SUI

export function Dashboard({ address }: Props) {
  const client = useSuiClient();

  const { data: suiBalData } = useSuiClientQuery(
    "getBalance",
    { owner: address, coinType: "0x2::sui::SUI" },
    { refetchInterval: 30_000 }
  );
  const suiBalance = suiBalData ? BigInt(suiBalData.totalBalance) : null;
  const lowGas = suiBalance !== null && suiBalance < SUI_GAS_WARN_THRESHOLD;

  const [managerBalance, setManagerBalance] = useState<bigint | null>(null);
  const [vault, setVault] = useState<VaultSummary | null>(null);
  const [oraclesWithPrice, setOraclesWithPrice] = useState<OracleWithPrice[]>([]);
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([]);
  const [totalPolicies, setTotalPolicies] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [vaultData, oracles] = await Promise.all([
          getVaultSummary(),
          getActiveOracles(),
        ]);
        if (cancelled) return;
        setVault(vaultData);

        // Deduplicate by underlying_asset for price display
        const seen = new Set<string>();
        const unique = oracles.filter((o) => {
          if (seen.has(o.underlying_asset)) return false;
          seen.add(o.underlying_asset);
          return true;
        });
        const withPrices = await Promise.all(
          unique.map(async (o) => {
            try {
              const p = await getOraclePrice(o.id);
              return { ...o, spotFormatted: formatUsd(BigInt(p.spot)), spotRaw: BigInt(p.spot) };
            } catch {
              return { ...o, spotFormatted: "—", spotRaw: 0n };
            }
          })
        );
        if (cancelled) return;
        setOraclesWithPrice(withPrices);

        // Manager balance via devInspect
        const cached = localStorage.getItem(MANAGER_KEY(address));
        if (cached) {
          const tx = new Transaction();
          tx.moveCall({
            target: `${PREDICT_PACKAGE}::predict_manager::balance`,
            typeArguments: [DUSDC_TYPE],
            arguments: [tx.object(cached)],
          });
          const result = await client.devInspectTransactionBlock({
            transactionBlock: tx,
            sender: address,
          });
          const bytes = result.results?.[0]?.returnValues?.[0]?.[0];
          if (bytes && bytes.length >= 8) {
            let val = 0n;
            for (let i = 7; i >= 0; i--) val = val * 256n + BigInt(bytes[i]);
            if (!cancelled) setManagerBalance(val);
          }
        }

        // Recent policy purchase events from our contract
        if (INSUIRANCE_PKG) {
          try {
            const events = await client.queryEvents({
              query: { MoveEventModule: { package: INSUIRANCE_PKG, module: "policy" } },
              limit: 20,
              order: "descending",
            });
            if (!cancelled) {
              setTotalPolicies(events.data.length); // lower bound (paged)
              const recent = events.data.slice(0, 5).map((e) => {
                const p = e.parsedJson as any;
                return {
                  id: e.id.txDigest,
                  buyer: p?.owner ?? e.sender ?? "unknown",
                  asset: p?.asset ?? "BTC",
                  timestampMs: e.timestampMs ?? null,
                };
              });
              setRecentEvents(recent);
            }
          } catch {}
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const t = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [address, client]);

  const utilizationPct = vault ? Math.min(Math.round(vault.utilization * 100), 100) : null;

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-4 animate-pulse h-20" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* SUI gas warning */}
      {lowGas && (
        <div
          className="rounded-xl px-4 py-3 text-xs"
          style={{ background: "rgba(234,179,8,.08)", border: "1px solid rgba(234,179,8,.2)", color: "rgba(253,224,71,.85)" }}
        >
          <span className="font-semibold">Low SUI balance</span> — you may not have enough gas for transactions.
          Get testnet SUI from the Sui Discord{" "}
          <span style={{ color: "rgba(253,224,71,1)", fontFamily: "monospace" }}>#testnet-faucet</span>.
        </div>
      )}

      {/* Live price sparkline — prominent */}
      {oraclesWithPrice.length > 0 && (
        <div className="grid grid-cols-1 gap-2">
          {oraclesWithPrice.map((o) => (
            <OraclePriceChart
              key={o.id}
              oracleId={o.id}
              asset={o.underlying_asset}
              initialFormatted={o.spotFormatted}
            />
          ))}
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Your Manager"
          value={managerBalance !== null ? formatDusdc(managerBalance) : "—"}
          sub={managerBalance === 0n ? "Deposit to start" : undefined}
        />
        <StatCard
          label="Vault Available"
          value={vault ? formatDusdc(BigInt(vault.available_liquidity)) : "—"}
          sub="testnet dUSDC · not real funds"
        />
      </div>

      {/* Vault utilization bar */}
      {utilizationPct !== null && (
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">Vault Utilization</span>
            <span className={`font-mono font-semibold ${utilizationPct > 80 ? "text-yellow-400" : "text-white"}`}>
              {utilizationPct}%
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                utilizationPct > 80 ? "bg-yellow-500" : utilizationPct > 50 ? "bg-blue-500" : "bg-green-500"
              }`}
              style={{ width: `${utilizationPct}%` }}
            />
          </div>
          {utilizationPct > 80 && (
            <p className="text-xs text-yellow-500">High demand — cover capacity may be limited</p>
          )}
        </div>
      )}

      {/* Recent activity */}
      {recentEvents.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Recent Activity</p>
            {totalPolicies !== null && (
              <span className="text-xs text-gray-500">{totalPolicies}{totalPolicies >= 20 ? "+" : ""} policies issued</span>
            )}
          </div>
          <div className="space-y-2">
            {recentEvents.map((e) => (
              <div key={e.id} className="flex items-center gap-2 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                <span className="font-mono text-gray-400">
                  {e.buyer.slice(0, 6)}…{e.buyer.slice(-4)}
                </span>
                <span className="text-gray-500">bought {e.asset} cover</span>
                {e.timestampMs && (
                  <span className="ml-auto text-gray-600">
                    {timeAgo(Number(e.timestampMs))}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-1">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-mono font-semibold text-sm truncate text-white">{value}</p>
      {sub && <p className="text-xs text-gray-600">{sub}</p>}
    </div>
  );
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}
