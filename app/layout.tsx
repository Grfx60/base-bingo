import type { Metadata } from "next";
import "./globals.css"; // Eğer küresel CSS'iniz yoksa bu satırı silebilirsiniz

// --- WAGMI & WEB3 AYARLARI ---
import { http, createConfig, WagmiProvider } from "wagmi";
import { base } from "wagmi/chains";
import { coinbaseWallet } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// 1. Basit bir Wagmi konfigürasyonu oluşturuyoruz
const config = createConfig({
  chains: [base],
  connectors: [
    coinbaseWallet({
      appName: "Base Brick Breaker",
    }),
  ],
  transports: {
    [base.id]: http(),
  },
});

// 2. React Query istemcisi (Wagmi 2.x için zorunludur)
const queryClient = new QueryClient();

// --- METADATA (TARAYICI BAŞLIĞI) ---
export const metadata: Metadata = {
  title: "Base Brick Breaker",
  description: "Web3 Brick Breaker Game on Base Network",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr">
      <body className="bg-slate-950 antialiased">
        {/* Tüm uygulamayı cüzdan sağlayıcıları ile sarmallıyoruz */}
        <WagmiProvider config={config}>
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        </WagmiProvider>
      </body>
    </html>
  );
}