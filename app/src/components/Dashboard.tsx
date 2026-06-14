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

const MANAGER_KEY = (addr: string) => `managerId_${addr}`;

interface Props {
  address: string;
}

interface OracleWithPrice extends OracleInfo {
  spotFormatted: string;
}

export function Dashboard({ address }: Props) {
  const client = useSuiClient();

  const [managerBalance, setManagerBalance] = useState<bigint | null>(null);
  const [vault, setVault] = useState<VaultSummary | null>(null);
  const [oraclesWithPrice, setOraclesWithPrice] = useState<OracleWithPrice[]>([]);
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

        // Fetch prices for oracles in parallel
        const withPrices = await Promise.all(
          oracles.map(async (o) => {
            try {
              const p = await getOraclePrice(o.id);
              return { ...o, spotFormatted: formatUsd(BigInt(p.spot)) };
            } catch {
              return { ...o, spotFormatted: "—" };
            }
          })
        );
        if (cancelled) return;
        setOraclesWithPrice(withPrices);

        // Manager balance
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

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-4 animate-pulse h-20" />
        ))}
      </div>
    );
  }

  const utilizationPct = vault ? Math.round(vault.utilization * 100) : null;

  return (
    <div className="space-y-3">
      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Your Manager Balance"
          value={managerBalance !== null ? formatDusdc(managerBalance) : "—"}
        />
        <StatCard
          label="Vault Liquidity"
          value={vault ? formatDusdc(BigInt(vault.available_liquidity)) : "—"}
        />
        <StatCard
          label="Vault Utilization"
          value={utilizationPct !== null ? `${utilizationPct}%` : "—"}
          highlight={utilizationPct !== null && utilizationPct > 80}
        />
        <StatCard
          label="Active Markets"
          value={String(oraclesWithPrice.length)}
        />
      </div>

      {/* Active oracle prices */}
      {oraclesWithPrice.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Live Prices</p>
          {oraclesWithPrice.map((o) => (
            <div key={o.id} className="flex items-center justify-between text-sm">
              <span className="text-gray-300">{o.underlying_asset}</span>
              <span className="font-mono font-semibold">{o.spotFormatted}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-1">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`font-mono font-semibold text-sm truncate ${highlight ? "text-yellow-400" : "text-white"}`}>
        {value}
      </p>
    </div>
  );
}
