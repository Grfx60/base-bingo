import type { Metadata } from "next";
import "./globals.css";
import { RootProvider } from "./rootProvider";

const APP_URL = "https://base-brick-breaker.vercel.app";
const OG_IMAGE_URL = `${APP_URL}/og-image.png`;

// Farcaster / Base App mini-app embed
const miniAppEmbed = {
  version: "1",
  imageUrl: OG_IMAGE_URL,
  button: {
    title: "🚀 Oyna",
    action: {
      type: "launch_miniapp",
      name: "Base Brick Breaker",
      url: APP_URL,
      splashImageUrl: OG_IMAGE_URL,
      splashBackgroundColor: "#0a1029",
    },
  },
};

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),

  title: "Base Brick Breaker",
  description: "Web3 Brick Breaker Game on Base Network",

  openGraph: {
    title: "Base Brick Breaker",
    description: "Web3 Brick Breaker Game on Base Network",
    url: APP_URL,
    siteName: "Base Brick Breaker",
    images: [
      {
        url: OG_IMAGE_URL,
        width: 1024,
        height: 1024,
        alt: "Base Brick Breaker",
      },
    ],
    type: "website",
  },

  twitter: {
    card: "summary_large_image",
    title: "Base Brick Breaker",
    description: "Web3 Brick Breaker Game on Base Network",
    images: [OG_IMAGE_URL],
  },

  other: {
    // Base Dashboard domain verification
    "base:app_id": "697e42fa2aafa0bc9ad8a2fd",

    "fc:miniapp": JSON.stringify(miniAppEmbed),
    "fc:frame": JSON.stringify(miniAppEmbed),
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