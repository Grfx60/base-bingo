/* eslint-disable */
// @ts-nocheck
"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { useAccount, useConnect, useDisconnect } from "wagmi";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const safeSupabaseUrl = supabaseUrl && supabaseUrl.startsWith("http") ? supabaseUrl : "https://dummy-project.supabase.co";
const safeSupabaseAnonKey = supabaseAnonKey || "dummy-key";
const supabase = createClient(safeSupabaseUrl, safeSupabaseAnonKey);

const FIXED_WIDTH = 400;
const FIXED_HEIGHT = 400; 
const PADDLE_WIDTH = 80;
const PADDLE_HEIGHT = 12;
const BALL_RADIUS = 7;

export default function BrickBreakerMiniApp() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // --- OYUN AYARLARI ---
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [lives, setLives] = useState(4);
  const [gameState, setGameState] = useState<"menu" | "playing" | "gameover" | "victory">("menu");
  const [isMuted, setIsMuted] = useState(false);
  const [gameMode, setGameMode] = useState<"tournament" | "practice">("tournament");
  const [playerLv, setPlayerLv] = useState(1);
  const [playerXp, setPlayerXp] = useState(0);
  const [attemptsLeft, setAttemptsLeft] = useState(3);
  const [isSdkLoaded, setIsSdkLoaded] = useState(false);

  const scoreRef = useRef(0);
  const levelRef = useRef(1);
  const livesRef = useRef(4);
  const gameStateRef = useRef("menu");
  const paddleXRef = useRef((FIXED_WIDTH - PADDLE_WIDTH) / 2);
  const paddleWidthRef = useRef(PADDLE_WIDTH);
  const ballXRef = useRef(FIXED_WIDTH / 2);
  const ballYRef = useRef(FIXED_HEIGHT - 30);
  
  // 🕹️ 1. DÜZELTME: Topun başlangıç hızını yavaşlattık (1.8 hız çarpanı)
  const ballVxFRef = useRef(1.8);
  const ballVyFRef = useRef(-1.8);
  const bricksRef = useRef([]);
  
  // 🎁 3. DÜZELTME: Bonus (Power-up) sistemi için state'ler ve referanslar
  const [activePowerUp, setActivePowerUp] = useState<string | null>(null);
  const powerUpsRef = useRef([]); // Ekranda düşen bonusları tutar

  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { levelRef.current = level; }, [level]);
  useEffect(() => { livesRef.current = lives; }, [lives]);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  // Farcaster SDK Entegrasyonu
  useEffect(() => {
    const initFarcasterMiniApp = async () => {
      try {
        const { sdk } = await import("@farcaster/miniapp-sdk");
        if (sdk) {
          await sdk.actions.init();
          setIsSdkLoaded(true);
          await sdk.actions.ready();
        }
      } catch (e) {
        setIsSdkLoaded(true);
      }
    };
    initFarcasterMiniApp();
  }, []);

  // Ses Efektleri
  const playAudio = useCallback((type) => {
    if (isMuted) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      if (type === "hit") { osc.frequency.setValueAtTime(160, ctx.currentTime); gain.gain.setValueAtTime(0.05, ctx.currentTime); osc.start(); osc.stop(ctx.currentTime + 0.08); }
      else if (type === "brick") { osc.frequency.setValueAtTime(340, ctx.currentTime); gain.gain.setValueAtTime(0.05, ctx.currentTime); osc.start(); osc.stop(ctx.currentTime + 0.06); }
      else if (type === "lose") { osc.frequency.setValueAtTime(120, ctx.currentTime); gain.gain.setValueAtTime(0.1, ctx.currentTime); osc.start(); osc.stop(ctx.currentTime + 0.3); }
      else if (type === "powerup") { osc.frequency.setValueAtTime(440, ctx.currentTime); gain.gain.setValueAtTime(0.08, ctx.currentTime); osc.start(); osc.stop(ctx.currentTime + 0.15); }
    } catch(e){}
  }, [isMuted]);

  // 🎨 2. DÜZELTME: Soft/Pastel renk paleti ve 3D gölge tonları
  const generateBricks = () => {
    const rows = 4; const cols = 6; const padding = 8; const offsetTop = 35; const offsetLeft = 14;
    const bWidth = (FIXED_WIDTH - offsetLeft * 2 - padding * (cols - 1)) / cols; const bHeight = 18;
    const arr = [];
    
    // Modern Soft/Pastel Renkler
    const colors = ["#A0C4FF", "#BDB2FF", "#FFADAD", "#FFD6A5"]; 
    const shadows = ["#7EA5E0", "#9B8FE0", "#E08E8E", "#E0B788"]; 

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        arr.push({
          x: c * (bWidth + padding) + offsetLeft,
          y: r * (bHeight + padding) + offsetTop,
          width: bWidth,
          height: bHeight,
          status: 1,
          color: colors[r % colors.length],
          shadowColor: shadows[r % shadows.length],
          // Rastgele bazı tuğlalara bonus gizleyelim
          hasPowerUp: Math.random() < 0.25 ? (Math.random() < 0.5 ? "WIDE" : "LIFE") : null
        });
      }
    }
    bricksRef.current = arr;
  };

  const startGame = () => {
    if (gameMode === "tournament" && !isConnected) { alert("Turnuva için lütfen önce sağ üstten cüzdanınızı bağlayın!"); return; }
    setScore(0); setLevel(1); setLives(4);
    paddleWidthRef.current = PADDLE_WIDTH;
    setActivePowerUp(null);
    powerUpsRef.current = [];
    paddleXRef.current = (FIXED_WIDTH - paddleWidthRef.current) / 2;
    generateBricks(); 
    resetBall(1);
    setGameState("playing");
  };

  // Seviye atladıkça topun hızını kademeli artıran mekanizma
  const resetBall = (currentLevel = levelRef.current) => {
    ballXRef.current = FIXED_WIDTH / 2; 
    ballYRef.current = FIXED_HEIGHT - 35;
    const speedMultiplier = 1.8 + (currentLevel - 1) * 0.4; // Her seviyede hızı 0.4 birim artar
    ballVxFRef.current = Math.random() > 0.5 ? speedMultiplier : -speedMultiplier;
    ballVyFRef.current = -speedMultiplier;
  };

  // Bölüm temizlendi mi kontrolü
  const checkVictory = () => {
    const anyLeft = bricksRef.current.some(b => b.status === 1);
    if (!anyLeft) {
      const nextLevel = level + 1;
      setLevel(nextLevel);
      generateBricks();
      resetBall(nextLevel);
    }
  };

  // Oyun Döngüsü Motoru
  useEffect(() => {
    let animId;
    const update = () => {
      if (gameStateRef.current !== "playing") return;
      
      // Topun Hareketi
      ballXRef.current += ballVxFRef.current; 
      ballYRef.current += ballVyFRef.current;

      // Duvar Çarpmaları
      if (ballXRef.current + BALL_RADIUS > FIXED_WIDTH || ballXRef.current - BALL_RADIUS < 0) { ballVxFRef.current = -ballVxFRef.current; playAudio("hit"); }
      if (ballYRef.current - BALL_RADIUS < 0) { ballVyFRef.current = -ballVyFRef.current; playAudio("hit"); }

      // Pedala Çarpma
      if (ballVyFRef.current > 0 && ballYRef.current + BALL_RADIUS >= FIXED_HEIGHT - PADDLE_HEIGHT - 4 && ballXRef.current >= paddleXRef.current && ballXRef.current <= paddleXRef.current + paddleWidthRef.current) {
        ballVyFRef.current = -ballVyFRef.current; 
        playAudio("hit");
      }

      // Topun Aşağı Düşmesi
      if (ballYRef.current > FIXED_HEIGHT) {
        playAudio("lose"); const nextLives = livesRef.current - 1; setLives(nextLives);
        if (nextLives <= 0) setGameState("gameover"); else resetBall();
      }

      // Tuğla Çarpmaları
      bricksRef.current.forEach((b) => {
        if (b.status <= 0) return;
        if (ballXRef.current >= b.x && ballXRef.current <= b.x + b.width && ballYRef.current >= b.y && ballYRef.current <= b.y + b.height) {
          b.status = 0; 
          setScore((s) => s + 10); 
          ballVyFRef.current = -ballVyFRef.current; 
          playAudio("brick");

          // Tuğla kırılınca bonus düşürme ihtimali
          if (b.hasPowerUp) {
            powerUpsRef.current.push({
              x: b.x + b.width / 2,
              y: b.y + b.height,
              type: b.hasPowerUp
            });
          }
          checkVictory();
        }
      });

      // 🎁 3. DÜZELTME: Bonus kapsüllerinin hareketi (Düşme hızını 1.2'ye sabitleyerek yavaşlattık)
      powerUpsRef.current.forEach((p, idx) => {
        p.y += 1.2; // Yumuşak ve yavaş düşüş hızı

        // Pedalla yakalama kontrolü
        if (p.y >= FIXED_HEIGHT - PADDLE_HEIGHT - 10 && p.y <= FIXED_HEIGHT && p.x >= paddleXRef.current && p.x <= paddleXRef.current + paddleWidthRef.current) {
          playAudio("powerup");
          if (p.type === "WIDE") {
            paddleWidthRef.current = PADDLE_WIDTH * 1.4; // Pedalı genişlet
            setActivePowerUp("Geniş Pedal");
            setTimeout(() => { paddleWidthRef.current = PADDLE_WIDTH; setActivePowerUp(null); }, 8000); // 8 saniye sonra normale dön
          } else if (p.type === "LIFE") {
            setLives(l => l + 1);
          }
          powerUpsRef.current.splice(idx, 1);
        }
        // Ekrandan çıkanları sil
        else if (p.y > FIXED_HEIGHT) {
          powerUpsRef.current.splice(idx, 1);
        }
      });
    };

    const render = () => {
      const canvas = canvasRef.current; if (!canvas) return;
      const ctx = canvas.getContext("2d"); if (!ctx) return;
      ctx.clearRect(0, 0, FIXED_WIDTH, FIXED_HEIGHT);
      ctx.fillStyle = "#0f172a"; ctx.fillRect(0, 0, FIXED_WIDTH, FIXED_HEIGHT);

      // 🎨 2. DÜZELTME: Gelişmiş Yuvarlak Köşeli ve 3D Parlamalı Tuğla Çizimi
      bricksRef.current.forEach((b) => {
        if (b.status <= 0) return;
        
        ctx.save();
        const radius = 5; // Köşe yuvarlaklığı derecesi

        // Alt 3D Gölge Katmanı
        ctx.fillStyle = b.shadowColor;
        ctx.beginPath();
        ctx.roundRect(b.x, b.y + 3, b.width, b.height, radius);
        ctx.fill();

        // Ana Soft Renkli Gövde Katmanı
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.roundRect(b.x, b.y, b.width, b.height, radius);
        ctx.fill();

        // Üst 3D Parlama (İç Işık) Efekti
        ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
        ctx.beginPath();
        ctx.roundRect(b.x + 2, b.y + 2, b.width - 4, 4, 2);
        ctx.fill();

        ctx.restore();
      });

      // Bonus Kapsüllerini Çizme
      powerUpsRef.current.forEach((p) => {
        ctx.fillStyle = p.type === "WIDE" ? "#38bdf8" : "#f43f5e";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
        ctx.fill();
        // İçine küçük bir simge ekleyelim
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 9px sans-serif";
        ctx.fillText(p.type === "WIDE" ? "↔️" : "❤️", p.x - 5, p.y + 3);
      });

      // Pedalı Çizme (Genişlik dinamik değişebilir)
      ctx.fillStyle = "#3b82f6";
      ctx.beginPath();
      ctx.roundRect(paddleXRef.current, FIXED_HEIGHT - PADDLE_HEIGHT - 4, paddleWidthRef.current, PADDLE_HEIGHT, 4);
      ctx.fill();

      // Topu Çizme
      ctx.fillStyle = "#f43f5e"; ctx.beginPath(); ctx.arc(ballXRef.current, ballYRef.current, BALL_RADIUS, 0, Math.PI * 2); ctx.fill();
    };

    const loop = () => { update(); render(); animId = requestAnimationFrame(loop); };
    if (gameState === "playing") animId = requestAnimationFrame(loop); else render();
    return () => cancelAnimationFrame(animId);
  }, [gameState, playAudio, level]);

  // Kontroller
  const handlePointerMove = (e) => {
    if (gameState !== "playing" || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left) * (FIXED_WIDTH / rect.width);
    paddleXRef.current = Math.max(0, Math.min(FIXED_WIDTH - paddleWidthRef.current, canvasX - paddleWidthRef.current / 2));
  };

  const handleTouchMove = (e) => {
    if (gameState !== "playing" || !canvasRef.current || e.touches.length === 0) return;
    if (e.cancelable) e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const touch = e.touches[0];
    const canvasX = (touch.clientX - rect.left) * (FIXED_WIDTH / rect.width);
    paddleXRef.current = Math.max(0, Math.min(FIXED_WIDTH - paddleWidthRef.current, canvasX - paddleWidthRef.current / 2));
  };

  if (!isSdkLoaded) {
    return (
      <div className="w-full max-w-md mx-auto p-8 bg-slate-900 border border-slate-800 rounded-2xl text-center text-slate-400 font-mono text-xs">
        Loading...
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto p-4 bg-slate-900 border border-slate-800 rounded-2xl text-white shadow-2xl flex flex-col gap-3 select-none overflow-hidden">
      
      {/* ÜST PANEL */}
      <div className="flex justify-between items-center border-b border-slate-800 pb-2">
        <div>
          <h1 className="text-base font-black tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
            BASE BINGO
          </h1>
          <p className="text-[10px] text-slate-500 font-bold">Brick Breaker Edition</p>
        </div>
        <button
          onClick={() => isConnected ? disconnect() : (connectors[0] && connect({ connector: connectors[0] }))}
          className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all ${
            isConnected ? "bg-slate-800 text-emerald-400 border border-emerald-500/20" : "bg-blue-600 text-white"
          }`}
        >
          {isConnected ? `${address.slice(0, 4)}...${address.slice(-4)}` : "Connect Wallet"}
        </button>
      </div>

      {/* DURUM GÖSTERGELERI */}
      <div className="grid grid-cols-3 text-center text-[11px] bg-slate-950 py-1.5 px-2 rounded-xl border border-slate-800 font-mono gap-1">
        <div>SCORE: <span className="text-emerald-400 font-bold">{score}</span></div>
        <div>LIVES: <span className="text-red-400 font-bold">{"❤️".repeat(Math.max(0, lives))}</span></div>
        <div>LEVEL: <span className="text-purple-400 font-bold">{level}</span></div>
      </div>

      {/* OYUN CANVAS EKRANI */}
      <div className="relative flex justify-center bg-slate-950 rounded-xl overflow-hidden border border-slate-800 aspect-[400/400] w-full">
        <canvas
          ref={canvasRef}
          width={FIXED_WIDTH}
          height={FIXED_HEIGHT}
          onPointerMove={handlePointerMove}
          onTouchMove={handleTouchMove}
          onTouchStart={handleTouchMove}
          className="w-full h-full block touch-none cursor-crosshair"
        />

        {/* Aktif Güç Göstergesi */}
        {activePowerUp && (
          <div className="absolute top-2 left-2 bg-blue-600/80 backdrop-blur-sm px-2 py-0.5 rounded text-[9px] font-bold tracking-wide animate-pulse">
            🔥 {activePowerUp} AKTİF!
          </div>
        )}

        {gameState !== "playing" && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center">
            {gameState === "menu" && (
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-blue-400 uppercase tracking-wider">Smash the Bricks!</h3>
                <button onClick={startGame} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 font-black rounded-lg tracking-wider text-[11px] shadow-md">
                  START GAME
                </button>
              </div>
            )}
            {gameState === "gameover" && (
              <div className="space-y-2">
                <h3 className="text-sm font-black text-red-500 tracking-widest">GAME OVER</h3>
                <p className="text-[11px] text-slate-400">Final Score: <span className="text-white font-bold">{score}</span></p>
                <button onClick={startGame} className="px-5 py-2 bg-red-600 font-bold rounded-lg text-[11px]">
                  TRY AGAIN
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ALT PANEL */}
      <div className="grid grid-cols-2 gap-2 text-[10px] bg-slate-950 p-2 rounded-xl border border-slate-800">
        <div className="flex flex-col justify-center">
          <span className="text-slate-500 font-bold text-[9px] uppercase">Player Status</span>
          <span className="font-bold text-blue-400 mt-0.5">LV {playerLv} ({playerXp} XP)</span>
        </div>
        <div className="flex flex-col justify-center items-end">
          <span className="text-slate-500 font-bold text-[9px] uppercase">Attempts Left</span>
          <span className="font-bold text-amber-400 font-mono mt-0.5">{attemptsLeft} / 3</span>
        </div>
      </div>

      {/* BUTON GRUBU */}
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <button onClick={() => setGameMode(m => m === "tournament" ? "practice" : "tournament")} className="py-2 bg-slate-800 border border-slate-700 font-bold rounded-lg text-slate-300 text-center">
          {gameMode === "tournament" ? "🏆 Tournament" : "🕹️ Practice"}
        </button>
        <button onClick={() => window.open(`https://farcaster.com/~/compose?text=${encodeURIComponent(`Base-Bingo Tuğla Kırma Oyununda ${score} puan topladım! Sen de katıl 🚀`)}`, "_blank")} className="py-2 bg-indigo-600 font-bold rounded-lg text-center text-white shadow-sm">
          Share 📤
        </button>
      </div>

    </div>
  );
}