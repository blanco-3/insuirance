"use client";

import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import { CoverForm } from "@/components/CoverForm";
import { PolicyList } from "@/components/PolicyList";
import { Dashboard } from "@/components/Dashboard";

export default function Home() {
  const account = useCurrentAccount();

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
              Buy downside cover on BTC. Settle onchain.
            </p>
          </div>

          {account ? (
            <>
              <Dashboard address={account.address} />
              <CoverForm address={account.address} />
              <PolicyList address={account.address} />
            </>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center space-y-4">
              <p className="text-gray-400">Connect your wallet to get started.</p>
              <ConnectButton />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
