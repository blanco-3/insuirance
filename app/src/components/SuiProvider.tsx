"use client";

import { SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "@mysten/dapp-kit/dist/index.css";

const queryClient = new QueryClient();
// @mysten/sui v2+: pass { url, network } directly (getFullnodeUrl removed)
const networks = {
  testnet: { url: "https://fullnode.testnet.sui.io:443", network: "testnet" as const },
};

export function SuiProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork="testnet">
        <WalletProvider autoConnect>{children}</WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
