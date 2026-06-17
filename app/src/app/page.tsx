"use client";

import { useState } from "react";
import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import { CoverForm } from "@/components/CoverForm";
import { PolicyList } from "@/components/PolicyList";
import { Dashboard } from "@/components/Dashboard";
import { HedgeCalculator } from "@/components/HedgeCalculator";

export default function Home() {
  const account = useCurrentAccount();
  const [suggestedCover, setSuggestedCover] = useState<string | undefined>();

  return (
    <div className="flex flex-col min-h-screen">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold tracking-tight">Insuirance</span>
          <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">
            Testnet
          </span>
        </div>
        <ConnectButton />
      </nav>

      {/* Main */}
      <main className="flex flex-1 flex-col items-center px-4 py-12">
        <div className="max-w-lg w-full space-y-4">
          <div className="text-center space-y-2 mb-8">
            <h1 className="text-4xl font-bold tracking-tight">
              Protect Your Crypto.
            </h1>
            <p className="text-gray-400 text-lg">
              Parametric downside cover. Settles onchain, automatically.
            </p>
          </div>

          {account ? (
            <>
              <Dashboard address={account.address} />
              <HedgeCalculator onHedge={setSuggestedCover} />
              <CoverForm address={account.address} suggestedCover={suggestedCover} />
              <PolicyList address={account.address} />
            </>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { icon: "🛡️", title: "Parametric", desc: "Auto payout — no claims process" },
                  { icon: "⛓️", title: "On-chain", desc: "Settled trustlessly by oracle" },
                  { icon: "🎯", title: "Multi-trigger", desc: "Stack coverage at every level" },
                ].map((c) => (
                  <div key={c.title} className="rounded-xl border border-white/10 bg-white/5 p-4 text-center space-y-1">
                    <div className="text-2xl">{c.icon}</div>
                    <p className="text-sm font-semibold">{c.title}</p>
                    <p className="text-xs text-gray-500">{c.desc}</p>
                  </div>
                ))}
              </div>
              <HedgeCalculator />
              {/* How it works */}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
                <p className="text-sm font-semibold text-gray-300">How it works</p>
                <div className="space-y-3">
                  {[
                    { n: "1", title: "Calculate your exposure", desc: "Enter your BTC holdings above to see your downside risk." },
                    { n: "2", title: "Pick a strategy", desc: "Choose Conservative, Balanced, Black Swan — or stack all three with Full Ladder." },
                    { n: "3", title: "Cover pays out automatically", desc: "If BTC settles below your strike at expiry, you receive dUSDC. No claims, no humans." },
                  ].map((s) => (
                    <div key={s.n} className="flex gap-3">
                      <span className="w-6 h-6 rounded-full bg-blue-600 text-xs flex items-center justify-center shrink-0 mt-0.5">{s.n}</span>
                      <div>
                        <p className="text-sm font-medium">{s.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{s.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="pt-2 text-center">
                  <ConnectButton />
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
