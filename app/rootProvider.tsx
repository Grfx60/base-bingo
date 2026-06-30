"use client";

import { ReactNode, useEffect } from "react";
import { base } from "wagmi/chains";
import { defineChain } from "viem";
import { http, createConfig, WagmiProvider } from "wagmi";
import { coinbaseWallet, injected } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OnchainKitProvider } from "@coinbase/onchainkit";
import "@coinbase/onchainkit/styles.css";

// --- SONEIUM AĞ TANIMI (Soneium Mainnet, Chain ID 1868) ---
export const soneium = defineChain({
  id: 1868,
  name: "Soneium",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.soneium.org"] },
  },
  blockExplorers: {
    default: { name: "Soneium Explorer", url: "https://soneium.blockscout.com" },
  },
});

// Re-export ediyoruz, BrickBreakerMiniApp.tsx içinden de aynı tanımı kullanabilmek için
export { base };

// --- ÇOKLU AĞ DESTEKLİ WAGMI CONFIG (Base + Soneium) ---
const wagmiConfig = createConfig({
  chains: [base, soneium],
  connectors: [
    coinbaseWallet({ appName: "Base Brick Breaker" }),
    injected(),
  ],
  transports: {
    [base.id]: http(),
    [soneium.id]: http(),
  },
  ssr: true,
});

const queryClient = new QueryClient();

type MiniKitLike = {
  ready?: () => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function RootProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    (async () => {
      try {
        const modUnknown: unknown = await import("@coinbase/onchainkit/minikit");

        let mk: MiniKitLike | null = null;

        if (isRecord(modUnknown)) {
          const maybeNamed = modUnknown["MiniKit"];
          const maybeDefault = modUnknown["default"];

          if (isRecord(maybeNamed)) mk = maybeNamed as MiniKitLike;
          else if (isRecord(maybeDefault)) mk = maybeDefault as MiniKitLike;
          else mk = modUnknown as MiniKitLike;
        }

        mk?.ready?.();
      } catch (e) {
        console.warn("MiniKit ready failed:", e);
      }
    })();
  }, []);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider
          apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
          chain={base}
          config={{
            appearance: { mode: "auto" },
            wallet: { display: "modal", preference: "all" },
          }}
          miniKit={{
            enabled: true,
            autoConnect: true,
            notificationProxyUrl: undefined,
          }}
          // Base Builder Code entegrasyonu (Projenizden dönen işlemleri Base ağına raporlar)
          projectId="bc_18cuakt7"
        >
          {children}
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
