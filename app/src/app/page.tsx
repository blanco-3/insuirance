"use client";

import { useState } from "react";
import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import { CoverForm } from "@/components/CoverForm";
import { PolicyList } from "@/components/PolicyList";
import { Dashboard } from "@/components/Dashboard";
import { HedgeCalculator } from "@/components/HedgeCalculator";
import { ShieldVault } from "@/components/ShieldVault";

export default function Home() {
  const account = useCurrentAccount();
  const [suggestedCover, setSuggestedCover] = useState<string | undefined>();
  const [tab, setTab] = useState<"cover" | "vault">("cover");

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
              Insuirance
            </h1>
            <p className="text-gray-400 text-lg">
              Buy BTC downside cover — or earn yield as the house.
            </p>
            <p className="text-gray-600 text-sm">
              Powered by DeepBook Predict · Settles onchain, automatically.
            </p>
          </div>

          {account ? (
            <>
              <Dashboard address={account.address} />

              {/* Tab switcher */}
              <div className="flex rounded-xl border border-white/10 bg-white/5 p-1 gap-1">
                {(["cover", "vault"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                      tab === t
                        ? "bg-white/10 text-white"
                        : "text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    {t === "cover" ? "🛡️ Buy Cover" : "💰 Earn Yield"}
                  </button>
                ))}
              </div>

              {tab === "cover" ? (
                <>
                  <HedgeCalculator onHedge={setSuggestedCover} />
                  <CoverForm address={account.address} suggestedCover={suggestedCover} />
                  <PolicyList address={account.address} />
                </>
              ) : (
                <ShieldVault address={account.address} />
              )}
            </>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { icon: "🛡️", title: "Buy Cover", desc: "Auto payout if BTC drops below strike" },
                  { icon: "💰", title: "Earn Yield", desc: "LP to Predict vault, earn premiums" },
                  { icon: "⛓️", title: "Onchain", desc: "Oracle settles trustlessly" },
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
                    { n: "1", title: "Calculate your exposure", desc: "Enter your BTC holdings to see exact dollar downside at 5%, 10%, 20% drops." },
                    { n: "2", title: "Buy cover or earn yield", desc: "Buy Cover: pick a strategy and get a Policy NFT. ShieldVault: deposit dUSDC and earn LP premiums." },
                    { n: "3", title: "Settles automatically", desc: "Oracle confirms price at expiry. Cover holders receive dUSDC instantly — no claims, no humans." },
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
