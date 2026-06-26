"use client";

import { useState, useEffect } from "react";
import { useAccount, useSignMessage, useConnect, useDisconnect } from "wagmi"; 
import BrickBreakerMiniApp from "./BrickBreakerMiniApp";

export default function Page() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  
  const [isSigned, setIsSigned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Sayfa tarayıcıda tamamen yüklenene kadar bekle (Hydration ve Eklenti Güvenliği)
  useEffect(() => {
    setMounted(true);
  }, []);

  // Eğer sayfa tarayıcıda henüz tamamen yüklenmediyse bariyeri koru, boş dön
  if (!mounted) return null;

  const handleSign = async () => {
    try {
      setLoading(true);
      await signMessageAsync({
        message: "Base-Bingo oyununa giriş yapmak ve şartları kabul etmek için bu mesajı onaylayın.",
      });
      setIsSigned(true);
    } catch (error) {
      console.error("İmzalama hatası:", error);
      alert("İmza onayı verilmedi veya bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  // AŞAMA 1: Cüzdan Bağlı Değilse (Giriş Butonları)
  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-slate-900 text-white">
        <h1 className="text-4xl font-extrabold mb-2 tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
          Base-Bingo
        </h1>
        <p className="text-slate-400 mb-8 text-center max-w-sm">
          Oyuna giriş yapabilmek için lütfen bir cüzdan seçip bağlayın.
        </p>
        
        <div className="flex flex-col gap-3 w-full max-w-xs">
          {connectors.map((connector) => (
            <button
              key={connector.uid}
              onClick={() => connect({ connector })}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 font-bold rounded-xl transition-all active:scale-95 text-center text-sm"
            >
              {connector.name} ile Bağlan
            </button>
          ))}
        </div>
      </div>
    );
  }

  // AŞAMA 2: Cüzdan Bağlı ama İmza Yoksa
  if (!isSigned) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-slate-900 text-white">
        <h1 className="text-4xl font-extrabold mb-2 tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
          Giriş Onayı
        </h1>
        <p className="text-emerald-400 font-medium mb-6 bg-emerald-500/10 px-4 py-1.5 rounded-full border border-emerald-500/20 text-sm">
          Bağlı Cüzdan: {address?.slice(0, 6)}...{address?.slice(-4)}
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
            onClick={() => disconnect()}
            className="text-xs text-slate-500 hover:text-slate-400 underline decoration-dotted hover:cursor-pointer"
          >
            Başka Cüzdan Seç / Bağlantıyı Kes
          </button>
        </div>
      </div>
    );
  }

  // AŞAMA 3: Her şey hazırsa oyunu başlat
  return <BrickBreakerMiniApp />;
}