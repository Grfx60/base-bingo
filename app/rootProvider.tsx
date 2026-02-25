"use client";

import { ReactNode, useEffect } from "react";
import { base } from "wagmi/chains";
import { OnchainKitProvider } from "@coinbase/onchainkit";
import "@coinbase/onchainkit/styles.css";

export function RootProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    (async () => {
      try {
        const mod: any = await import("@coinbase/onchainkit/minikit");
        const mk = mod?.MiniKit ?? mod?.default ?? mod;
        mk?.ready?.();
      } catch (e) {
        // Sessiz geç: ready çağrısı sadece Base Mini App preview/host içinde gerekir
        console.warn("MiniKit ready failed:", e);
      }
    })();
  }, []);

  return (
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
    >
      {children}
    </OnchainKitProvider>
  );
}