import type { Metadata } from "next";
import "./globals.css"; // Eğer küresel CSS dosyanız varsa

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
        {children}
      </body>
    </html>
  );
}