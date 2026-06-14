"use client";

import { useState, useEffect } from "react";
import { useSuiClientQuery, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import {
  PREDICT_ID,
  PREDICT_PACKAGE,
  DUSDC_TYPE,
  BTC_ORACLES,
  formatDusdc,
  formatUsd,
  getAllOracles,
  type OracleInfo,
} from "@/lib/predict-api";

const INSUIRANCE_PACKAGE = process.env.NEXT_PUBLIC_INSUIRANCE_PACKAGE ?? "";
const CLOCK_ID = "0x6";

// oracle id → { date, expiry }
const ORACLE_META = Object.fromEntries(
  Object.entries(BTC_ORACLES).map(([date, id]) => [
    id,
    { date, expiry: new Date(date + "T08:00:00Z").getTime() },
  ])
);

const STATUS_LABEL: Record<number, string> = {
  0: "Active",
  1: "Claimed",
  2: "Expired",
};

function normalizeId(raw: string): string {
  return raw.startsWith("0x") ? raw : `0x${raw}`;
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
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successes, setSuccesses] = useState<Record<string, string>>({});

  useEffect(() => {
    getAllOracles().then(setOracles).catch(() => {});
  }, []);

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
        // Withdraw payout from manager into wallet
        const coin = tx.moveCall({
          target: `${PREDICT_PACKAGE}::predict_manager::withdraw`,
          typeArguments: [DUSDC_TYPE],
          arguments: [
            tx.object(normalizeId(managerId)),
            tx.pure.u64(BigInt(quantity)),
          ],
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

      {isLoading && (
        <p className="text-sm text-gray-400">Loading policies…</p>
      )}

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
        const hasPayout =
          isSettled && settlementPrice !== null && settlementPrice <= strike;
        const meta = Object.values(ORACLE_META).find(
          (m) => Math.abs(m.expiry - expiry) < 3_600_000
        );

        return (
          <div
            key={policyId}
            className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold">BTC Cover</span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  status === 0
                    ? "bg-blue-600"
                    : status === 1
                    ? "bg-green-600"
                    : "bg-gray-600"
                }`}
              >
                {STATUS_LABEL[status] ?? "Unknown"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-gray-400">Strike</p>
                <p className="font-mono">{formatUsd(strike)}</p>
              </div>
              <div>
                <p className="text-gray-400">Cover</p>
                <p className="font-mono">{formatDusdc(quantity)}</p>
              </div>
              <div>
                <p className="text-gray-400">Premium Paid</p>
                <p className="font-mono">{formatDusdc(premiumPaid)}</p>
              </div>
              <div>
                <p className="text-gray-400">Expires</p>
                <p className="font-mono text-xs">
                  {meta?.date ?? new Date(expiry).toLocaleDateString()}
                </p>
              </div>
              {isSettled && settlementPrice !== null && (
                <div className="col-span-2">
                  <p className="text-gray-400">Settlement</p>
                  <p className={`font-mono ${hasPayout ? "text-green-400" : "text-gray-300"}`}>
                    {formatUsd(settlementPrice)}{" "}
                    {hasPayout ? "→ PAYOUT" : "→ No payout"}
                  </p>
                </div>
              )}
            </div>

            {errors[policyId] && (
              <p className="text-xs text-red-400">{errors[policyId]}</p>
            )}
            {successes[policyId] && (
              <p className="text-xs text-green-400 break-all">
                Done! {successes[policyId].slice(0, 20)}…
              </p>
            )}

            {isActive && (
              <button
                onClick={() =>
                  handleClaim(policyId, managerId, oracleId, quantity, String(strike))
                }
                disabled={isPending && claimingId === policyId}
                className={`w-full rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                  isSettled
                    ? hasPayout
                      ? "bg-green-700 hover:bg-green-600"
                      : "bg-gray-700 hover:bg-gray-600"
                    : "bg-white/10 hover:bg-white/20 cursor-not-allowed"
                }`}
              >
                {!isSettled
                  ? "Waiting for settlement…"
                  : hasPayout
                  ? "Claim & Receive Payout"
                  : "Finalize (no payout)"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
