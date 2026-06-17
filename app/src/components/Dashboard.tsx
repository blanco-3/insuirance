"use client";

import { useEffect, useState } from "react";
import { useSuiClient } from "@mysten/dapp-kit";
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

export function Dashboard({ address }: Props) {
  const client = useSuiClient();

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
                  buyer: p?.buyer ?? e.sender ?? "unknown",
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
      {/* Live prices — prominent */}
      {oraclesWithPrice.length > 0 && (
        <div className="grid grid-cols-1 gap-2">
          {oraclesWithPrice.map((o) => (
            <div
              key={o.id}
              className="rounded-xl border border-white/10 bg-gradient-to-r from-blue-950/30 to-white/5 px-4 py-3 flex items-center justify-between"
            >
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">{o.underlying_asset} / USD</p>
                <p className="text-2xl font-bold font-mono">{o.spotFormatted}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">Oracle</p>
                <p className="text-xs font-mono text-gray-400">{o.id.slice(0, 8)}…</p>
              </div>
            </div>
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
              <span className="text-xs text-gray-500">{totalPolicies}+ policies issued</span>
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
