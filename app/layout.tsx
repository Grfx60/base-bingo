import type { Metadata } from "next";
import "./globals.css";
import { RootProvider } from "./rootProvider"; 

export const metadata: Metadata = {
  title: "Base Brick Breaker",
  description: "Web3 Brick Breaker Game on Base Network",
  other: {
    "base:app_id": "697e42fa2aafa0bc9ad8a2fd",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr">
      <body className="bg-slate-950 antialiased">
        <RootProvider>
          {children}
        </RootProvider>
      </body>
    </html>
  );
}