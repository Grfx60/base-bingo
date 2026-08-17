"use client";

import { useEffect, useState } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSignMessage,
} from "wagmi";
import BrickBreakerMiniApp from "./BrickBreakerMiniApp";

export default function Page() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();

  const [isSigned, setIsSigned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  /**
   * Base App / Base Account öncelikli connector.
   * Masaüstü tarayıcılarında injected wallet'lar için
   * fallback olarak ilk connector kullanılır.
   */
  const handleConnect = async () => {
    try {
      setConnectError(null);

      const baseAccountConnector =
        connectors.find((connector) => connector.id === "baseAccount") ??
        connectors[0];

      if (!baseAccountConnector) {
        throw new Error("Kullanılabilir cüzdan bağlantısı bulunamadı.");
      }

      await connect({
        connector: baseAccountConnector,
      });
    } catch (error) {
      console.error("Cüzdan bağlantı hatası:", error);

      setConnectError(
        error instanceof Error
          ? error.message
          : "Cüzdan bağlanırken bir hata oluştu."
      );
    }
  };

  const handleSign = async () => {
    try {
      setLoading(true);

      await signMessageAsync({
        message:
          "Base Brick Breaker oyununa giriş yapmak ve şartları kabul etmek için bu mesajı onaylayın.",
      });

      setIsSigned(true);
    } catch (error) {
      console.error("İmzalama hatası:", error);

      alert("İmza onayı verilmedi veya bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  // AŞAMA 1: Cüzdan bağlı değil
  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-slate-900 text-white">
        <h1 className="text-4xl font-extrabold mb-2 tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
          Base Brick Breaker
        </h1>

        <p className="text-slate-400 mb-8 text-center max-w-sm">
          Oyuna giriş yapabilmek için lütfen cüzdanınızı bağlayın.
        </p>

        <button
          onClick={handleConnect}
          disabled={isConnecting}
          className="w-full max-w-xs py-4 px-6 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-500/10"
        >
          {isConnecting ? "Cüzdan Bağlanıyor..." : "Cüzdanı Bağla"}
        </button>

        {connectError && (
          <div className="mt-4 max-w-xs text-center text-sm text-red-400 break-words">
            {connectError}
          </div>
        )}
      </div>
    );
  }

  // AŞAMA 2: Cüzdan bağlı ama imza yok
  if (!isSigned) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-slate-900 text-white">
        <h1 className="text-4xl font-extrabold mb-2 tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
          Giriş Onayı
        </h1>

        <p className="text-emerald-400 font-medium mb-6 bg-emerald-500/10 px-4 py-1.5 rounded-full border border-emerald-500/20 text-sm">
          Bağlı Cüzdan: {address?.slice(0, 6)}...
          {address?.slice(-4)}
        </p>

        <div className="flex flex-col gap-4 w-full max-w-xs text-center">
          <button
            onClick={handleSign}
            disabled={loading}
            className="w-full py-4 bg-amber-500 hover:bg-amber-600 font-bold rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50 text-slate-950"
          >
            {loading ? "Onay Bekleniyor..." : "Oyuna Girişi Onayla"}
          </button>

          <button
            onClick={() => {
              disconnect();
              setIsSigned(false);
            }}
            className="text-xs text-slate-500 hover:text-slate-400 underline decoration-dotted"
          >
            Cüzdanı Değiştir
          </button>
        </div>
      </div>
    );
  }

  // AŞAMA 3: Cüzdan bağlı + imza başarılı → oyun
  return <BrickBreakerMiniApp />;
}