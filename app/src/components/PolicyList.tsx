"use client";

import { useState, useEffect } from "react";
import { useSuiClientQuery, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import {
  PREDICT_ID,
  PREDICT_PACKAGE,
  DUSDC_TYPE,
  formatDusdc,
  formatUsd,
  getAllOracles,
  getOraclePrice,
  type OracleInfo,
} from "@/lib/predict-api";

const INSUIRANCE_PACKAGE = process.env.NEXT_PUBLIC_INSUIRANCE_PACKAGE ?? "";
const CLOCK_ID = "0x6";

const STATUS_LABEL: Record<number, string> = {
  0: "Active",
  1: "Claimed",
  2: "Expired",
};

function normalizeId(raw: string): string {
  return raw.startsWith("0x") ? raw : `0x${raw}`;
}

function Countdown({ expiry }: { expiry: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const ms = expiry - now;
  if (ms <= 0) return <span className="text-red-400 text-xs font-mono">Expired</span>;

  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);

  const urgency = ms < 3_600_000; // < 1 hour

  return (
    <span className={`text-xs font-mono tabular-nums ${urgency ? "text-red-400 animate-pulse" : "text-gray-300"}`}>
      {d > 0 ? `${d}d ` : ""}{String(h).padStart(2, "0")}h {String(m).padStart(2, "0")}m {String(s).padStart(2, "0")}s
    </span>
  );
}

interface Props {
  address: string;
}

export function PolicyList({ address }: Props) {
  const { data, isLoading, refetch } = useSuiClientQuery(
    "getOwnedObjects",
    {
      owner: address,
      filter: { StructType: `${INSUIRANCE_PACKAGE}::policy::Policy` },
      options: { showContent: true },
    },
    { enabled: !!INSUIRANCE_PACKAGE, refetchInterval: 20_000 }
  );

  const { mutateAsync: signAndExecute, isPending } = useSignAndExecuteTransaction();

  const [oracles, setOracles] = useState<OracleInfo[]>([]);
  const [livePrices, setLivePrices] = useState<Record<string, bigint>>({});
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successes, setSuccesses] = useState<Record<string, string>>({});

  useEffect(() => {
    getAllOracles().then(setOracles).catch(() => {});
  }, []);

  // Fetch live spot prices for active oracles
  useEffect(() => {
    const active = oracles.filter((o) => o.status === "active");
    if (active.length === 0) return;

    async function fetchPrices() {
      const results = await Promise.allSettled(
        active.map(async (o) => {
          const p = await getOraclePrice(o.id);
          return [o.id, BigInt(p.spot)] as [string, bigint];
        })
      );
      const map: Record<string, bigint> = {};
      for (const r of results) {
        if (r.status === "fulfilled") map[r.value[0]] = r.value[1];
      }
      setLivePrices(map);
    }

    fetchPrices();
    const t = setInterval(fetchPrices, 15_000);
    return () => clearInterval(t);
  }, [oracles]);

  const policies = data?.data ?? [];
  if (!isLoading && policies.length === 0) return null;

  function getOracleInfo(oracleId: string): OracleInfo | undefined {
    return oracles.find((o) => o.id === oracleId || o.id === normalizeId(oracleId));
  }

  async function handleClaim(
    policyId: string,
    managerId: string,
    oracleId: string,
    quantity: string,
    strikeRaw: string
  ) {
    setClaimingId(policyId);
    setErrors((e) => ({ ...e, [policyId]: "" }));
    setSuccesses((s) => ({ ...s, [policyId]: "" }));

    const oracle = getOracleInfo(oracleId);
    const settlement = oracle?.settlement_price ? BigInt(oracle.settlement_price) : null;
    const strikeVal = BigInt(strikeRaw);
    const hasPayout = settlement !== null && settlement <= strikeVal;

    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${INSUIRANCE_PACKAGE}::policy::claim`,
        typeArguments: [DUSDC_TYPE],
        arguments: [
          tx.object(policyId),
          tx.object(PREDICT_ID),
          tx.object(normalizeId(managerId)),
          tx.object(normalizeId(oracleId)),
          tx.object(CLOCK_ID),
        ],
      });

      if (hasPayout) {
        const coin = tx.moveCall({
          target: `${PREDICT_PACKAGE}::predict_manager::withdraw`,
          typeArguments: [DUSDC_TYPE],
          arguments: [tx.object(normalizeId(managerId)), tx.pure.u64(BigInt(quantity))],
        });
        tx.transferObjects([coin], address);
      }

      const result = await signAndExecute({ transaction: tx });
      setSuccesses((s) => ({ ...s, [policyId]: result.digest }));
      refetch();
    } catch (e: any) {
      setErrors((err) => ({ ...err, [policyId]: e.message ?? "Claim failed" }));
    } finally {
      setClaimingId(null);
    }
  }

  return (
    <div className="space-y-3 mt-8">
      <h2 className="text-lg font-semibold">My Policies</h2>

      {isLoading && <p className="text-sm text-gray-400">Loading policies…</p>}

      {policies.map((obj) => {
        const content = obj.data?.content as any;
        const fields = content?.fields;
        if (!fields) return null;

        const policyId = obj.data!.objectId;
        const oracleId = normalizeId(fields.oracle_id as string);
        const managerId = normalizeId(fields.manager_id as string);
        const strike = BigInt(fields.strike as string);
        const quantity = fields.quantity as string;
        const premiumPaid = fields.premium_paid as string;
        const status = Number(fields.status);
        const isActive = status === 0;
        const expiry = Number(fields.expiry as string);

        const oracleInfo = getOracleInfo(oracleId);
        const isSettled = oracleInfo?.status === "settled";
        const settlementPrice = oracleInfo?.settlement_price
          ? BigInt(oracleInfo.settlement_price)
          : null;
        const hasPayout = isSettled && settlementPrice !== null && settlementPrice <= strike;

        // Live price stats (only for active oracles)
        const currentSpot = livePrices[oracleId] ?? null;
        const inTheMoneyLive = currentSpot !== null && currentSpot <= strike;
        const gapToStrike = currentSpot !== null && currentSpot > strike ? currentSpot - strike : 0n;
        const gapPct = currentSpot !== null && currentSpot > 0n
          ? (Number(gapToStrike) / Number(currentSpot)) * 100
          : 0;

        return (
          <div
            key={policyId}
            className={`rounded-xl border p-4 space-y-3 transition-colors ${
              hasPayout
                ? "border-green-500/50 bg-green-950/20"
                : inTheMoneyLive
                ? "border-blue-500/40 bg-blue-950/10"
                : "border-white/10 bg-white/5"
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold">
                  {oracleInfo?.underlying_asset ?? "BTC"} Cover
                </span>
                {hasPayout && (
                  <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded-full animate-pulse">
                    PAYOUT READY
                  </span>
                )}
                {!hasPayout && inTheMoneyLive && isActive && !isSettled && (
                  <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">
                    IN THE MONEY
                  </span>
                )}
              </div>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  status === 0 ? "bg-blue-600" : status === 1 ? "bg-green-600" : "bg-gray-600"
                }`}
              >
                {STATUS_LABEL[status] ?? "Unknown"}
              </span>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-gray-400 text-xs">Strike</p>
                <p className="font-mono font-semibold">{formatUsd(strike)}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Cover</p>
                <p className="font-mono">{formatDusdc(quantity)}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Premium Paid</p>
                <p className="font-mono">{formatDusdc(premiumPaid)}</p>
              </div>
              {currentSpot !== null && isActive && !isSettled && (
                <div>
                  <p className="text-gray-400 text-xs">BTC Live</p>
                  <p className={`font-mono font-semibold ${inTheMoneyLive ? "text-green-400" : "text-white"}`}>
                    {formatUsd(currentSpot)}
                  </p>
                </div>
              )}
              {isSettled && settlementPrice !== null && (
                <div className="col-span-2">
                  <p className="text-gray-400 text-xs">Settlement</p>
                  <p className={`font-mono font-semibold ${hasPayout ? "text-green-400" : "text-gray-300"}`}>
                    {formatUsd(settlementPrice)} {hasPayout ? "→ PAYOUT ✓" : "→ No payout"}
                  </p>
                </div>
              )}
            </div>

            {/* Countdown + gap indicator */}
            {isActive && (
              <div className={`rounded-lg px-3 py-2.5 space-y-1.5 ${
                hasPayout ? "bg-green-900/30" :
                inTheMoneyLive ? "bg-blue-900/20" :
                "bg-white/5"
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Time until expiry</span>
                  <Countdown expiry={expiry} />
                </div>
                {!isSettled && currentSpot !== null && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">
                      {inTheMoneyLive ? "Above strike by" : "Needs to drop"}
                    </span>
                    <span className={`text-xs font-mono font-semibold ${
                      inTheMoneyLive ? "text-green-400" : "text-amber-400"
                    }`}>
                      {inTheMoneyLive
                        ? `${formatUsd(strike - currentSpot)} (${((Number(strike - currentSpot) / Number(currentSpot)) * 100).toFixed(1)}%)`
                        : `${formatUsd(gapToStrike)} more (${gapPct.toFixed(1)}%)`
                      }
                    </span>
                  </div>
                )}
              </div>
            )}

            {errors[policyId] && (
              <p className="text-xs text-red-400">{errors[policyId]}</p>
            )}
            {successes[policyId] && (
              <p className="text-xs text-green-400 break-all">Done! {successes[policyId].slice(0, 20)}…</p>
            )}

            {isActive && (
              <button
                onClick={() => handleClaim(policyId, managerId, oracleId, quantity, String(strike))}
                disabled={(isPending && claimingId === policyId) || (!isSettled)}
                className={`w-full rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                  hasPayout
                    ? "bg-green-600 hover:bg-green-500 text-white"
                    : isSettled
                    ? "bg-gray-700 hover:bg-gray-600 text-white"
                    : "bg-white/5 text-gray-500 cursor-not-allowed"
                }`}
              >
                {claimingId === policyId
                  ? "Claiming…"
                  : !isSettled
                  ? "Waiting for oracle settlement…"
                  : hasPayout
                  ? `Claim ${formatDusdc(quantity)}`
                  : "Finalize (no payout)"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
