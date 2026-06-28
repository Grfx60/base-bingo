import type { Metadata } from "next";
import { Inter, Source_Code_Pro } from "next/font/google";
import { SafeArea } from "@coinbase/onchainkit/minikit";
import { minikitConfig } from "@/minikit.config";
import { RootProvider } from "./rootProvider";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  // Oyununuza yakışacak modern bir kapak / açılış görseli URL'si
  // Kendi özel görselinizi yüklediğinizde bu linki güncelleyebilirsiniz
  const customSplashImage = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1000&auto=format&fit=crop";

  return {
    title: minikitConfig.miniapp.name,
    description: minikitConfig.miniapp.description,
    openGraph: {
      title: minikitConfig.miniapp.name,
      description: minikitConfig.miniapp.description,
    },
    other: {
      "base:app_id": "6a3eab37fb80a74d69497aa5",

      // Farcaster v2 Konfigürasyonu
      "fc:frame": JSON.stringify({
        version: "next",
        imageUrl: customSplashImage, // Mağazada ve aramalarda görünecek ana resim
        button: {
          title: `Play ${minikitConfig.miniapp.name}`,
          action: {
            type: "launch_frame",
            name: minikitConfig.miniapp.name,
            url: "https://base-bingo-rho.vercel.app/",
            splashImageUrl: customSplashImage, // Açılışta (Splash) görünecek özel resminiz
            splashBackgroundColor: "#020617", // Arka plan koyu gece mavisi
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="base:app_id" content="6a3eab37fb80a74d69497aa5" />
      </head>
      <body className={`${inter.variable} ${sourceCodePro.variable} antialiased bg-slate-950 text-white`}>
        <RootProvider>
          <SafeArea>{children}</SafeArea>
        </RootProvider>
      </body>
    </html>
  );
}