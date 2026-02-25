"use client";

import { ReactNode, useEffect } from "react";
import { base } from "wagmi/chains";
import { OnchainKitProvider } from "@coinbase/onchainkit";
import "@coinbase/onchainkit/styles.css";

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