"use client";

import { useState, useEffect } from "react";
import { useAccount, useSignMessage } from "wagmi"; 
// OnchainKit'in resmi cüzdan menüsü bileşenlerini dahil ediyoruz
import { Wallet, ConnectWallet, WalletDropdown, WalletDropdownDisconnect } from "@coinbase/onchainkit/wallet";
import BrickBreakerMiniApp from "./BrickBreakerMiniApp";

export default function Page() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  
  const [isSigned, setIsSigned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);


  if (!mounted) return null;

  const handleSign = async () => {
    try {
      setLoading(true);
      await signMessageAsync({
        message: "Base Brick Breaker oyununa giriş yapmak ve şartları kabul etmek için bu mesajı onaylayın.",
      });
      setIsSigned(true);
    } catch (error) {
      console.error("İmzalama hatası:", error);
      alert("İmza onayı verilmedi veya bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  // AŞAMA 1: Cüzdan Bağlı Değilse (Tek ve Şık Bir Cüzdan Bağlama Menüsü)
  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-slate-900 text-white">
        <h1 className="text-4xl font-extrabold mb-2 tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
          Base Brick Breaker
        </h1>
        <p className="text-slate-400 mb-8 text-center max-w-sm">
          Oyuna giriş yapabilmek için lütfen cüzdanınızı bağlayın.
        </p>
        
        {/* OnchainKit Hazır Menülü Cüzdan Butonu Yapısı */}
        <div className="flex justify-center w-full max-w-xs">
          <Wallet>
            <ConnectWallet className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-500/10 text-center" />
            <WalletDropdown>
              <div className="p-4 text-sm text-slate-300">Bağlı cüzdanınızla devam edebilirsiniz.</div>
              <WalletDropdownDisconnect className="w-full text-left text-slate-100" />
            </WalletDropdown>
          </Wallet>
          <ConnectWallet className="ml-3 py-2 px-3 text-xs bg-transparent border border-slate-700 text-slate-300 hover:bg-slate-800 rounded-md" />
        </div>
      </div>
    );
  }

  // AŞAMA 2: Cüzdan Bağlı ama İmza Yoksa
  if (!isSigned) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-slate-900 text-white">
        <h1 className="text-4xl font-extrabold mb-2 tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
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
          
          {/* İmza aşamasında cüzdan değiştirmek isterse diye açılır menüyü burada da gösteriyoruz */}
          <div className="mt-2 flex justify-center text-xs">
            <Wallet>
              <ConnectWallet className="bg-transparent text-slate-500 hover:text-slate-400 underline decoration-dotted text-xs p-0 border-none hover:bg-transparent" />
              <WalletDropdown>
                <WalletDropdownDisconnect />
              </WalletDropdown>
            </Wallet>
          </div>
        </div>
      </div>
    );
  }

  // AŞAMA 3: Her şey hazırsa oyunu başlat
  return <BrickBreakerMiniApp />;
}