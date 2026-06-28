import type { Metadata } from "next";
import { Inter, Source_Code_Pro } from "next/font/google";
import { SafeArea } from "@coinbase/onchainkit/minikit";
import { minikitConfig } from "@/minikit.config";
import { RootProvider } from "./rootProvider";
import "./globals.css";

// 1. DİNAMİK METADATA OLUŞTURUCU (Hem Base Hem Farcaster İçin)
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: minikitConfig.miniapp.name,
    description: minikitConfig.miniapp.description,
    openGraph: {
      title: minikitConfig.miniapp.name,
      description: minikitConfig.miniapp.description,
    },
    other: {
      // Base App ID doğrulaması (Metadata Seviyesi)
      "base:app_id": "6a3eab37fb80a74d69497aa5",

      // Farcaster Frames v2 / Mini-App Yapılandırması
      "fc:frame": JSON.stringify({
        version: "next",
        imageUrl: minikitConfig.miniapp.heroImageUrl,
        button: {
          title: `Play ${minikitConfig.miniapp.name}`,
          action: {
            type: "launch_frame",
            name: minikitConfig.miniapp.name,
            url: "https://uygulamaniz.vercel.app/", // Kendi canlı Vercel URL'niz ile güncelleyin
            splashImageUrl: minikitConfig.miniapp.heroImageUrl,
            splashBackgroundColor: "#0f172a",
          },
        },
      }),
    },
  };
}

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const sourceCodePro = Source_Code_Pro({
  variable: "--font-source-code-pro",
  subsets: ["latin"],
});

// 2. ANA ISKELET (ROOT LAYOUT)
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Base App ID doğrulaması (HTML Head Seviyesi) */}
        <meta name="base:app_id" content="6a3eab37fb80a74d69497aa5" />
      </head>
      <body className={`${inter.variable} ${sourceCodePro.variable} antialiased bg-slate-950`}>
        <RootProvider>
          <SafeArea>{children}</SafeArea>
        </RootProvider>
      </body>
    </html>
  );
}