"use client";

import { useState } from "react";
import { useAccount, useSignMessage } from "wagmi"; 
import BrickBreakerMiniApp from "./BrickBreakerMiniApp";

export default function Page() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [isSigned, setIsSigned] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSign = async () => {
    try {
      setLoading(true);
      
      // Kullanıcının cüzdanına imza isteği gönderir
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

  // AŞAMA 1: Kullanıcı cüzdanını henüz bağlamamışsa
  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-slate-900 text-white">
        <h1 className="text-4xl font-extrabold mb-2 tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
          Base-Bingo
        </h1>
        <p className="text-slate-400 mb-8 text-center max-w-sm">
          Oyuna giriş yapabilmek için lütfen Base cüzdanınızı bağlayın.
        </p>
        <div className="p-4 bg-slate-800 rounded-xl border border-slate-700 text-sm text-center">
          Lütfen ekranın sağ üst köşesinde veya cüzdan sağlayıcınızda bulunan 
          <span className="text-blue-400 font-bold"> "Connect Wallet" </span> 
          butonunu kullanarak cüzdanınızı bağlayın.
        </div>
      </div>
    );
  }

  // AŞAMA 2: Cüzdan bağlı ama imza onayı verilmemişse
  if (!isSigned) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-slate-900 text-white">
        <h1 className="text-4xl font-extrabold mb-2 tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
          Giriş Onayı
        </h1>
        <p className="text-emerald-400 font-medium mb-6 bg-emerald-500/10 px-4 py-1.5 rounded-full border border-emerald-500/20 text-sm">
          Bağlı Cüzdan: {address?.slice(0, 6)}...{address?.slice(-4)}
        </p>
        <p className="text-slate-400 mb-8 text-center max-w-sm">
          Oyunu başlatabilmek için cüzdanınızdan giriş işlemini imzalamanız gerekmektedir.
        </p>
        <button
          onClick={handleSign}
          disabled={loading}
          className="px-8 py-4 bg-amber-500 hover:bg-amber-600 font-bold rounded-xl shadow-lg hover:shadow-amber-500/20 transition-all duration-200 active:scale-95 disabled:opacity-50 text-slate-950"
        >
          {loading ? "Onay Bekleniyor..." : "Oyuna Girişi Onayla"}
        </button>
      </div>
    );
  }

  // AŞAMA 3: Her iki aşama da tamamlandıysa oyunu yükle
  return <BrickBreakerMiniApp />;
}