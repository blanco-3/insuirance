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
              <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center space-y-4">
                <p className="text-gray-400">Connect your wallet to start buying cover.</p>
                <ConnectButton />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
