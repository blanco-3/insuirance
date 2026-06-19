"use client";

import { useState, useEffect } from "react";
import {
  useSuiClient,
  useSuiClientQuery,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { DepthAnimation } from "@/components/DepthAnimation";
import { Transaction } from "@mysten/sui/transactions";
import {
  PREDICT_ID,
  DUSDC_TYPE,
  formatDusdc,
  getVaultSummary,
  type VaultSummary,
} from "@/lib/predict-api";
import { parseError } from "@/lib/parseError";

const INSUIRANCE_PACKAGE = process.env.NEXT_PUBLIC_INSUIRANCE_PACKAGE ?? "";
const SHIELD_VAULT_ID = process.env.NEXT_PUBLIC_SHIELD_VAULT_ID ?? "";
const CLOCK_ID = "0x6";
// VaultShare NFTs were minted by the v2 package (0x6b928a…).
// The current package (v3, INSUIRANCE_PACKAGE) is an upgrade of v2, so deposit/withdraw
// calls work fine, but getOwnedObjects filter must use the ORIGINAL package address
// because the on-chain object type is still branded with the package that created it.
// Original (v1) package ID is the same for all upgrades in the Sui upgrade chain.
const VAULT_SHARE_PKG = "0x6b928ab422e1b91252a257027b11e8e1acca36b64d62be40a0059ab008fcf41c";
const VAULT_SHARE_TYPE = `${VAULT_SHARE_PKG}::vault::VaultShare`;

interface Props {
  address: string;
}

interface VaultOnchain {
  total_shares: bigint;
  total_plp: bigint;
}

interface ShareNft {
  id: string;
  shares: bigint;
}

export function ShieldVault({ address }: Props) {
  const client = useSuiClient();
  const { mutateAsync: signAndExecute, isPending } = useSignAndExecuteTransaction();

  const [amount, setAmount] = useState("");
  const [dusdcBalance, setDusdcBalance] = useState<bigint>(0n);
  const [vaultOnchain, setVaultOnchain] = useState<VaultOnchain | null>(null);
  const [predictSummary, setPredictSummary] = useState<VaultSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successTx, setSuccessTx] = useState("");
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [showDepthAnim, setShowDepthAnim] = useState(false);

  // User's VaultShare NFTs
  const { data: shareData, refetch: refetchShares } = useSuiClientQuery(
    "getOwnedObjects",
    {
      owner: address,
      filter: { StructType: VAULT_SHARE_TYPE },
      options: { showContent: true },
    },
    { enabled: !!INSUIRANCE_PACKAGE, refetchInterval: 20_000 }
  );

  const shares: ShareNft[] = (shareData?.data ?? []).flatMap((obj) => {
    const fields = (obj.data?.content as any)?.fields;
    if (!fields) return [];
    return [{ id: obj.data!.objectId, shares: BigInt(fields.shares) }];
  });

  const totalUserShares = shares.reduce((acc, s) => acc + s.shares, 0n);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        // dUSDC wallet balance
        const bal = await client.getBalance({ owner: address, coinType: DUSDC_TYPE });
        if (!cancelled) setDusdcBalance(BigInt(bal.totalBalance));

        // ShieldVault on-chain state
        if (SHIELD_VAULT_ID) {
          const obj = await client.getObject({
            id: SHIELD_VAULT_ID,
            options: { showContent: true },
          });
          // RPC returns { dataType, type, hasPublicTransfer, fields: { id, plp_balance, total_shares } }
          const fields = (obj.data?.content as any)?.fields;
          if (fields && !cancelled) {
            // plp_balance is a Balance<PLP> — Sui RPC returns it as a nested object { fields: { value: "..." } }
            // rather than a bare integer; handle both forms for safety.
            const rawPlp = fields.plp_balance?.fields?.value ?? fields.plp_balance ?? "0";
            setVaultOnchain({
              total_shares: BigInt(fields.total_shares ?? "0"),
              total_plp: BigInt(rawPlp),
            });
          }
        }

        // Predict vault summary (for PLP share price)
        const summary = await getVaultSummary();
        if (!cancelled) setPredictSummary(summary);
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

  /**
   * True dUSDC value of a given number of vault shares.
   * = (shares / vault_total_shares) * vault_total_plp * plp_share_price
   */
  function sharesToDusdc(shareAmt: bigint): bigint {
    if (!vaultOnchain || !predictSummary) return 0n;
    const { total_shares, total_plp } = vaultOnchain;
    if (total_shares === 0n || total_plp === 0n) return 0n;

    // user_plp = (shareAmt * total_plp) / total_shares
    const userPlp = (shareAmt * total_plp) / total_shares;
    // dusdc_value = userPlp * plp_share_price  (share_price is a float, e.g. 1.000994)
    // Multiply by 1e6 to keep dUSDC 6-decimal precision
    const duscRaw = Number(userPlp) * predictSummary.plp_share_price;
    return BigInt(Math.round(duscRaw));
  }

  const userDusdcValue = sharesToDusdc(totalUserShares);

  async function handleDeposit() {
    setError("");
    setSuccessTx("");
    const amountRaw = BigInt(Math.round(parseFloat(amount) * 1_000_000));
    if (amountRaw <= 0n) { setError("Enter a valid amount"); return; }
    if (amountRaw > dusdcBalance) { setError("Insufficient dUSDC balance"); return; }

    try {
      const tx = new Transaction();

      // Get dUSDC coins — merge all into first, then split exact amount
      const coinsResp = await client.getCoins({ owner: address, coinType: DUSDC_TYPE });
      if (coinsResp.data.length === 0) { setError("No dUSDC coins found"); return; }

      const primary = tx.object(coinsResp.data[0].coinObjectId);
      if (coinsResp.data.length > 1) {
        tx.mergeCoins(primary, coinsResp.data.slice(1).map(c => tx.object(c.coinObjectId)));
      }
      const [depositCoin] = tx.splitCoins(primary, [tx.pure.u64(amountRaw)]);

      tx.moveCall({
        target: `${INSUIRANCE_PACKAGE}::vault::deposit_entry`,
        typeArguments: [DUSDC_TYPE],
        arguments: [
          tx.object(SHIELD_VAULT_ID),
          tx.object(PREDICT_ID),
          depositCoin,
          tx.object(CLOCK_ID),
        ],
      });

      const result = await signAndExecute({ transaction: tx });
      setSuccessTx(result.digest);
      setAmount("");
      setShowDepthAnim(true);
      refetchShares();
    } catch (e: any) {
      setError(parseError(e) || "Transaction failed");
    }
  }

  async function handleWithdraw(shareId: string) {
    setError("");
    setSuccessTx("");
    setWithdrawingId(shareId);
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${INSUIRANCE_PACKAGE}::vault::withdraw_entry`,
        typeArguments: [DUSDC_TYPE],
        arguments: [
          tx.object(SHIELD_VAULT_ID),
          tx.object(PREDICT_ID),
          tx.object(shareId),
          tx.object(CLOCK_ID),
        ],
      });
      const result = await signAndExecute({ transaction: tx });
      setSuccessTx(result.digest);
      refetchShares();
    } catch (e: any) {
      setError(parseError(e) || "Withdraw failed");
    } finally {
      setWithdrawingId(null);
    }
  }

  // Total return since vault inception (share price starts at 1.0)
  // e.g. plp_share_price = 1.000994 → +0.099% total earned so far
  const totalReturn = predictSummary
    ? ((predictSummary.plp_share_price - 1) * 100).toFixed(3)
    : null;

  return (
    <>
    {showDepthAnim && (
      <DepthAnimation type="deposit" onDone={() => setShowDepthAnim(false)} />
    )}
    <div className="space-y-4 mt-8">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">ShieldVault</h2>
        <div className="flex items-center gap-2">
          {totalReturn && (
            <span className="text-xs font-mono text-emerald-400">+{totalReturn}% since inception</span>
          )}
          <span className="text-xs bg-emerald-700 text-white px-2 py-0.5 rounded-full">
            LP Yield
          </span>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Deposit dUSDC → vault becomes a DeepBook Predict LP → earns premiums from options traders.
        Receive a VaultShare NFT. Withdraw anytime (subject to vault liquidity).
      </p>

      {/* Stats */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-4 animate-pulse h-16" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="Your Balance"
            value={formatDusdc(dusdcBalance)}
            sub="Available dUSDC"
          />
          <StatCard
            label="Your Vault Position"
            value={totalUserShares > 0n ? formatDusdc(userDusdcValue) : "—"}
            sub={totalUserShares > 0n ? "Current value" : "Not deposited"}
          />
          <StatCard
            label="PLP Share Price"
            value={predictSummary ? predictSummary.plp_share_price.toFixed(6) : "—"}
            sub="Grows with premiums"
          />
          <StatCard
            label="Vault Utilization"
            value={predictSummary ? `${(predictSummary.utilization * 100).toFixed(2)}%` : "—"}
            sub="Of vault at risk"
          />
        </div>
      )}

      {/* Deposit form */}
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-5 space-y-4">
        <p className="text-sm font-semibold text-emerald-300">Deposit dUSDC</p>

        <div className="flex rounded-lg border border-white/10 bg-white/5 overflow-hidden">
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="flex-1 bg-transparent px-3 py-2.5 text-sm text-white focus:outline-none"
            placeholder="Amount"
          />
          <button
            onClick={() => setAmount((Number(dusdcBalance) / 1_000_000).toFixed(6))}
            className="px-3 text-xs text-emerald-400 hover:text-emerald-300 border-l border-white/10"
          >
            MAX
          </button>
          <span className="flex items-center pr-3 text-sm text-gray-400 font-mono">DUSDC</span>
        </div>

        {amount && parseFloat(amount) > 0 && (
          <p className="text-xs text-gray-500">
            Deposit → predict.supply() → PLP stored in vault → VaultShare NFT minted to you
          </p>
        )}

        <button
          onClick={handleDeposit}
          disabled={isPending || !amount || parseFloat(amount) <= 0}
          className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm py-2.5 transition-colors"
        >
          {isPending && !withdrawingId ? "Depositing…" : "Deposit & Earn"}
        </button>

        {dusdcBalance === 0n && !loading && (
          <div className="rounded-lg px-3 py-2.5 text-xs space-y-1" style={{ background: "rgba(42,212,255,.06)", border: "1px solid rgba(42,212,255,.12)" }}>
            <p className="font-semibold" style={{ color: "#2ad4ff" }}>Need dUSDC?</p>
            <p style={{ color: "rgba(160,200,230,.6)" }}>
              Mint testnet dUSDC via the DeepBook Predict faucet on Sui testnet.
              Get SUI gas from the Sui Discord <span style={{ color: "rgba(42,212,255,.8)" }}>#testnet-faucet</span> first.
            </p>
          </div>
        )}
        {error && <p className="text-xs text-red-400">{error}</p>}
        {successTx && (
          <p className="text-xs text-green-400 break-all">
            Done! tx: {successTx.slice(0, 24)}…
          </p>
        )}
      </div>

      {/* User's VaultShare positions */}
      {shares.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Your Positions</p>
          {shares.map((s) => {
            const posValue = sharesToDusdc(s.shares);
            const poolSharePct = vaultOnchain && vaultOnchain.total_shares > 0n
              ? (Number(s.shares) / Number(vaultOnchain.total_shares) * 100).toFixed(4)
              : "—";

            return (
              <div key={s.id} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500">VaultShare NFT</p>
                    <p className="font-mono text-sm font-semibold">
                      {formatDusdc(posValue)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Pool share</p>
                    <p className="font-mono text-xs text-gray-300">{poolSharePct}%</p>
                  </div>
                </div>
                <div className="text-xs text-gray-600 font-mono">
                  {s.id.slice(0, 10)}…{s.id.slice(-6)}
                </div>
                <button
                  onClick={() => handleWithdraw(s.id)}
                  disabled={isPending}
                  className="w-full rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white text-sm py-2 transition-colors"
                >
                  {withdrawingId === s.id ? "Withdrawing…" : "Withdraw"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
    </>
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
