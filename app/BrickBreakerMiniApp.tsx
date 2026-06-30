/* eslint-disable */
// @ts-nocheck
"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { useAccount, useConnect, useDisconnect, useSendTransaction, useChainId, useSwitchChain } from "wagmi";
import { parseEther } from "viem";
import { base, soneium } from "./rootProvider";

// --- OYUN ÜCRETİ AYARLARI ---
const GAME_FEE_RECIPIENT = "0xBe96fB12585Bd1cd2822Ae451A69eA5E8970806F";
const GAME_FEE_AMOUNT = parseEther("0.00001");

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
  const { sendTransactionAsync } = useSendTransaction();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // --- ÖDEME DURUMU ---
  const [isPaying, setIsPaying] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

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
  const ballVxFRef = useRef(1.8);
  const ballVyFRef = useRef(-1.8);
  const bricksRef = useRef([]);
  const trailRef = useRef([]); // top için komet izi

  // Bonus (Power-up) Sistemleri
  const [activePowerUp, setActivePowerUp] = useState<string | null>(null);
  const powerUpsRef = useRef([]);
  const isFrozenRef = useRef(false);
  const isFireRef = useRef(false);

  // Paylaşım menüsü (Farcaster / X seçimi)
  const [shareMenuOpen, setShareMenuOpen] = useState(false);

  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { levelRef.current = level; }, [level]);
  useEffect(() => { livesRef.current = lives; }, [lives]);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  // Oyuncu XP / Seviye sistemi: her 100 XP'de bir seviye atlanır
  useEffect(() => {
    const required = playerLv * 100;
    if (playerXp >= required) {
      setPlayerLv((l) => l + 1);
      setPlayerXp((xp) => xp - required);
    }
  }, [playerXp, playerLv]);

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
    } catch (e) { }
  }, [isMuted]);

  // --- NEON TUĞLA RENK PALETİ (görseldeki gibi) ---
  const NEON_PALETTE = [
    { fill: "#3b82f6", glow: "#60a5fa" }, // mavi
    { fill: "#8b5cf6", glow: "#a78bfa" }, // mor
    { fill: "#facc15", glow: "#fde047" }, // sarı
    { fill: "#22d3ee", glow: "#67e8f9" }, // turkuaz
    { fill: "#f43f5e", glow: "#fb7185" }, // kırmızı/pembe
    { fill: "#f97316", glow: "#fb923c" }, // turuncu
  ];

  const generateBricks = (currentLevel = 1) => {
    // Her 5 levelde bir tuğla sıra sayısı 1 artar (1-5: 5 sıra, 6-10: 6 sıra, ...)
    const rows = 5 + Math.floor((currentLevel - 1) / 5);
    const cols = 6; const padding = 6; const offsetTop = 22; const offsetLeft = 14;
    const bWidth = (FIXED_WIDTH - offsetLeft * 2 - padding * (cols - 1)) / cols; const bHeight = 20;
    const arr = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const palette = NEON_PALETTE[Math.floor(Math.random() * NEON_PALETTE.length)];
        arr.push({
          x: c * (bWidth + padding) + offsetLeft,
          y: r * (bHeight + padding) + offsetTop,
          width: bWidth,
          height: bHeight,
          status: 1,
          color: palette.fill,
          shadowColor: palette.glow,
          hasPowerUp: null
        });
      }
    }

    // Tuğla sırasını karıştırıyoruz, böylece power-up'lar rastgele yerlere dağılır
    const shuffledIndexes = arr.map((_, i) => i);
    for (let i = shuffledIndexes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledIndexes[i], shuffledIndexes[j]] = [shuffledIndexes[j], shuffledIndexes[i]];
    }

    const MAX_POWERUPS_PER_LEVEL = 5;
    let powerUpCount = 0;
    let cursor = 0;

    // Her 3 levelde bir (3, 6, 9, ...) rastgele bir tuğlaya can (LIFE) power-up'ı yerleştirilir
    if (currentLevel % 3 === 0 && shuffledIndexes.length > 0) {
      arr[shuffledIndexes[cursor]].hasPowerUp = "LIFE";
      powerUpCount++;
      cursor++;
    }

    // Geri kalan power-up'lar tamamen rastgele (Dondurucu / Ateş / Pedal Uzatma), max 5 sınırı dahilinde
    const regularTypes = ["FREEZE", "FIRE", "WIDE"];
    for (; cursor < shuffledIndexes.length && powerUpCount < MAX_POWERUPS_PER_LEVEL; cursor++) {
      if (Math.random() < 0.18) {
        arr[shuffledIndexes[cursor]].hasPowerUp = regularTypes[Math.floor(Math.random() * regularTypes.length)];
        powerUpCount++;
      }
    }

    bricksRef.current = arr;
  };

  const startGame = async () => {
    if (gameMode === "tournament" && !isConnected) { alert("Turnuva için lütfen önce sağ üstten cüzdanınızı bağlayın!"); return; }
    if (!isConnected) { alert("Oyunu başlatmak için lütfen önce cüzdanınızı bağlayın!"); return; }

    setPaymentError(null);

    // Sadece Tournament modunda ücret alınır, Practice modu ücretsizdir (sadece bağlı cüzdan/sign yeterli)
    if (gameMode === "tournament") {
      setIsPaying(true);
      try {
        await sendTransactionAsync({
          to: GAME_FEE_RECIPIENT,
          value: GAME_FEE_AMOUNT,
        });
      } catch (err) {
        console.error("Ödeme hatası:", err);
        setPaymentError("Ödeme onaylanmadı veya bir hata oluştu. Lütfen tekrar deneyin.");
        setIsPaying(false);
        return;
      }
      setIsPaying(false);
    }

    setScore(0); setLevel(1); setLives(4);
    paddleWidthRef.current = PADDLE_WIDTH;
    setActivePowerUp(null);
    powerUpsRef.current = [];
    isFrozenRef.current = false;
    isFireRef.current = false;
    trailRef.current = [];
    paddleXRef.current = (FIXED_WIDTH - paddleWidthRef.current) / 2;
    generateBricks(1);
    resetBall(1);
    setGameState("playing");
  };

  const resetBall = (currentLevel = levelRef.current) => {
    ballXRef.current = FIXED_WIDTH / 2;
    ballYRef.current = FIXED_HEIGHT - 35;
    let speedMultiplier = 1.8 + (currentLevel - 1) * 0.15;
    if (isFrozenRef.current) {
      speedMultiplier = speedMultiplier * 0.5;
    }
    ballVxFRef.current = Math.random() > 0.5 ? speedMultiplier : -speedMultiplier;
    ballVyFRef.current = -speedMultiplier;
    trailRef.current = [];
  };

  const checkVictory = () => {
    const anyLeft = bricksRef.current.some(b => b.status === 1);
    if (!anyLeft) {
      const nextLevel = level + 1;
      setLevel(nextLevel);
      generateBricks(nextLevel);
      resetBall(nextLevel);
    }
  };

  useEffect(() => {
    let animId;

    const update = () => {
      if (gameStateRef.current !== "playing") return;
      ballXRef.current += ballVxFRef.current;
      ballYRef.current += ballVyFRef.current;

      // komet izi için son konumları sakla
      trailRef.current.push({ x: ballXRef.current, y: ballYRef.current });
      if (trailRef.current.length > 8) trailRef.current.shift();

      if (ballXRef.current + BALL_RADIUS > FIXED_WIDTH || ballXRef.current - BALL_RADIUS < 0) { ballVxFRef.current = -ballVxFRef.current; playAudio("hit"); }
      if (ballYRef.current - BALL_RADIUS < 0) { ballVyFRef.current = -ballVyFRef.current; playAudio("hit"); }
      if (ballVyFRef.current > 0 && ballYRef.current + BALL_RADIUS >= FIXED_HEIGHT - PADDLE_HEIGHT - 4 && ballXRef.current >= paddleXRef.current && ballXRef.current <= paddleXRef.current + paddleWidthRef.current) {
        ballVyFRef.current = -ballVyFRef.current;
        playAudio("hit");
      }
      if (ballYRef.current > FIXED_HEIGHT) {
        playAudio("lose"); const nextLives = livesRef.current - 1; setLives(nextLives);
        if (nextLives <= 0) setGameState("gameover"); else resetBall();
      }

      bricksRef.current.forEach((b) => {
        if (b.status <= 0) return;
        if (ballXRef.current >= b.x && ballXRef.current <= b.x + b.width && ballYRef.current >= b.y && ballYRef.current <= b.y + b.height) {
          b.status = 0;
          setScore((s) => s + 10);
          setPlayerXp((x) => x + 5);
          playAudio("brick");
          if (!isFireRef.current) {
            ballVyFRef.current = -ballVyFRef.current;
          }
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

      powerUpsRef.current.forEach((p, idx) => {
        p.y += 1.2;
        if (p.y >= FIXED_HEIGHT - PADDLE_HEIGHT - 10 && p.y <= FIXED_HEIGHT && p.x >= paddleXRef.current && p.x <= paddleXRef.current + paddleWidthRef.current) {
          playAudio("powerup");
          if (p.type === "WIDE") {
            paddleWidthRef.current = PADDLE_WIDTH * 1.4;
            setActivePowerUp("Geniş Pedal");
            setTimeout(() => { paddleWidthRef.current = PADDLE_WIDTH; setActivePowerUp(null); }, 5000);
          }
          else if (p.type === "LIFE") {
            setLives(l => l + 1);
          }
          else if (p.type === "FREEZE") {
            if (!isFrozenRef.current) {
              isFrozenRef.current = true;
              ballVxFRef.current *= 0.5;
              ballVyFRef.current *= 0.5;
              setActivePowerUp("❄️ Dondurucu Top");
              setTimeout(() => {
                isFrozenRef.current = false;
                ballVxFRef.current *= 2;
                ballVyFRef.current *= 2;
                setActivePowerUp(null);
              }, 5000);
            }
          }
          else if (p.type === "FIRE") {
            isFireRef.current = true;
            setActivePowerUp("🔥 Ateş Topu");
            setTimeout(() => {
              isFireRef.current = false;
              setActivePowerUp(null);
            }, 5000);
          }
          powerUpsRef.current.splice(idx, 1);
        }
        else if (p.y > FIXED_HEIGHT) {
          powerUpsRef.current.splice(idx, 1);
        }
      });
    };

    const render = () => {
      const canvas = canvasRef.current; if (!canvas) return;
      const ctx = canvas.getContext("2d"); if (!ctx) return;

      // --- NEON ARKA PLAN (lacivert + altıgen ızgara) ---
      ctx.clearRect(0, 0, FIXED_WIDTH, FIXED_HEIGHT);
      const bgGrad = ctx.createLinearGradient(0, 0, 0, FIXED_HEIGHT);
      bgGrad.addColorStop(0, "#070b1f");
      bgGrad.addColorStop(1, "#0a1029");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, FIXED_WIDTH, FIXED_HEIGHT);

      // ince altıgen ızgara deseni
      ctx.save();
      ctx.strokeStyle = "rgba(59, 130, 246, 0.08)";
      ctx.lineWidth = 1;
      const hexSize = 26;
      for (let row = 0; row < FIXED_HEIGHT / (hexSize * 0.87) + 2; row++) {
        for (let col = 0; col < FIXED_WIDTH / (hexSize * 1.5) + 2; col++) {
          const cx = col * hexSize * 1.5 + (row % 2 === 0 ? 0 : hexSize * 0.75);
          const cy = row * hexSize * 0.87;
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i;
            const px = cx + hexSize * 0.5 * Math.cos(angle);
            const py = cy + hexSize * 0.5 * Math.sin(angle);
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.stroke();
        }
      }
      ctx.restore();

      // --- NEON TUĞLALAR ---
      bricksRef.current.forEach((b) => {
        if (b.status <= 0) return;
        ctx.save();
        const radius = 6;
        ctx.shadowColor = b.shadowColor;
        ctx.shadowBlur = 12;

        // ana gövde - hafif gradyan ile cam/parlak görünüm
        const grad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.height);
        grad.addColorStop(0, b.shadowColor);
        grad.addColorStop(1, b.color);
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.roundRect(b.x, b.y, b.width, b.height, radius); ctx.fill();

        // üst parlama çizgisi
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
        ctx.beginPath(); ctx.roundRect(b.x + 3, b.y + 2, b.width - 6, b.height * 0.32, 3); ctx.fill();
        ctx.restore();
      });

      // --- POWER-UPS ---
      powerUpsRef.current.forEach((p) => {
        let pColor = "#38bdf8";
        let pIcon = "↔️";
        if (p.type === "LIFE") { pColor = "#f43f5e"; pIcon = "❤️"; }
        else if (p.type === "FREEZE") { pColor = "#60a5fa"; pIcon = "❄️"; }
        else if (p.type === "FIRE") { pColor = "#f97316"; pIcon = "🔥"; }
        ctx.save();
        ctx.shadowColor = pColor;
        ctx.shadowBlur = 10;
        ctx.fillStyle = pColor;
        ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 9px sans-serif";
        ctx.fillText(pIcon, p.x - 5, p.y + 3);
        ctx.restore();
      });

      // --- NEON PEDAL (ışıltılı) ---
      const padY = FIXED_HEIGHT - PADDLE_HEIGHT - 4;
      ctx.save();
      ctx.shadowColor = "#3b82f6";
      ctx.shadowBlur = 16;
      const padGrad = ctx.createLinearGradient(paddleXRef.current, padY, paddleXRef.current, padY + PADDLE_HEIGHT);
      padGrad.addColorStop(0, "#60a5fa");
      padGrad.addColorStop(1, "#1d4ed8");
      ctx.fillStyle = padGrad;
      ctx.beginPath(); ctx.roundRect(paddleXRef.current, padY, paddleWidthRef.current, PADDLE_HEIGHT, 6); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
      ctx.beginPath(); ctx.roundRect(paddleXRef.current + paddleWidthRef.current * 0.12, padY + 3, paddleWidthRef.current * 0.76, 2.5, 2); ctx.fill();
      ctx.restore();

      // --- KOMET İZLİ NEON TOP ---
      let ballColor = "#ef4444";
      if (isFireRef.current) ballColor = "#f97316";
      else if (isFrozenRef.current) ballColor = "#60a5fa";

      // iz (trail)
      trailRef.current.forEach((t, i) => {
        const alpha = (i / trailRef.current.length) * 0.35;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = ballColor;
        ctx.beginPath(); ctx.arc(t.x, t.y, BALL_RADIUS * (0.4 + i / trailRef.current.length * 0.6), 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      });

      ctx.save();
      ctx.shadowColor = ballColor;
      ctx.shadowBlur = 18;
      const ballGrad = ctx.createRadialGradient(
        ballXRef.current - 2, ballYRef.current - 2, 1,
        ballXRef.current, ballYRef.current, BALL_RADIUS
      );
      ballGrad.addColorStop(0, "#ffffff");
      ballGrad.addColorStop(0.4, ballColor);
      ballGrad.addColorStop(1, ballColor);
      ctx.fillStyle = ballGrad;
      ctx.beginPath(); ctx.arc(ballXRef.current, ballYRef.current, BALL_RADIUS, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      if (isFireRef.current || isFrozenRef.current) {
        ctx.save();
        ctx.strokeStyle = isFireRef.current ? "rgba(249, 115, 22, 0.5)" : "rgba(96, 165, 250, 0.5)";
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(ballXRef.current, ballYRef.current, BALL_RADIUS + 3, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    };

    const loop = () => { update(); render(); animId = requestAnimationFrame(loop); };
    if (gameState === "playing") animId = requestAnimationFrame(loop); else render();
    return () => cancelAnimationFrame(animId);
  }, [gameState, playAudio, level]);

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

  // Paylaşım: Farcaster (composeCast SDK) veya X (Twitter) seçeneği sunulur
  const getShareText = () => `Base Brick Breaker oyununda ${score} puan topladım! Sen de katıl ve tuğlaları kır 🚀`;

  const handleShareFarcaster = async () => {
    setShareMenuOpen(false);
    const shareText = getShareText();
    try {
      const { sdk } = await import("@farcaster/miniapp-sdk");
      await sdk.actions.composeCast({
        text: shareText,
        embeds: [typeof window !== "undefined" ? window.location.href : ""],
      });
    } catch (e) {
      console.warn("composeCast başarısız, link kopyalanıyor:", e);
      try {
        await navigator.clipboard.writeText(`${shareText} ${window.location.href}`);
        alert("Paylaşım metni kopyalandı!");
      } catch (clipErr) {
        console.error("Kopyalama da başarısız:", clipErr);
      }
    }
  };

  const handleShareX = async () => {
    setShareMenuOpen(false);
    const shareText = getShareText();
    const pageUrl = typeof window !== "undefined" ? window.location.href : "";
    const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(pageUrl)}`;
    try {
      const { sdk } = await import("@farcaster/miniapp-sdk");
      await sdk.actions.openUrl(xUrl);
    } catch (e) {
      window.open(xUrl, "_blank");
    }
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
          {/* Yeni Oyun İsmi: BASE BRICK BREAKER */}
          <h1 className="text-base font-black tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
            BASE BRICK BREAKER
          </h1>
          <p className="text-[10px] text-slate-500 font-bold">Classic Arcade Edition</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-1">
            <button
              onClick={() => switchChain({ chainId: base.id })}
              className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all ${
                chainId === base.id ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 border border-slate-700"
              }`}
            >
              Base
            </button>
            <button
              onClick={() => switchChain({ chainId: soneium.id })}
              className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all ${
                chainId === soneium.id ? "bg-purple-600 text-white" : "bg-slate-800 text-slate-400 border border-slate-700"
              }`}
            >
              Soneium
            </button>
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
        {activePowerUp && (
          <div className="absolute top-2 left-2 bg-blue-600/80 backdrop-blur-sm px-2 py-0.5 rounded text-[9px] font-bold tracking-wide animate-pulse">
            {activePowerUp} AKTİF!
          </div>
        )}
        {gameState !== "playing" && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center">
            {gameState === "menu" && (
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-blue-400 uppercase tracking-wider">Smash the Bricks!</h3>
                <button onClick={startGame} disabled={isPaying} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 font-black rounded-lg tracking-wider text-[11px] shadow-md disabled:opacity-50">
                  {isPaying ? "Onay Bekleniyor..." : "START GAME"}
                </button>
                {paymentError && <p className="text-[9px] text-red-400 max-w-[200px]">{paymentError}</p>}
              </div>
            )}
            {gameState === "gameover" && (
              <div className="space-y-2">
                <h3 className="text-sm font-black text-red-500 tracking-widest">GAME OVER</h3>
                <p className="text-[11px] text-slate-400">Final Score: <span className="text-white font-bold">{score}</span></p>
                <button onClick={startGame} disabled={isPaying} className="px-5 py-2 bg-red-600 font-bold rounded-lg text-[11px] disabled:opacity-50">
                  {isPaying ? "Onay Bekleniyor..." : "TRY AGAIN"}
                </button>
                {paymentError && <p className="text-[9px] text-red-400 max-w-[200px]">{paymentError}</p>}
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
        {/* Yenilenmiş Paylaşım: Farcaster veya X seçimi sunan açılır menü */}
        <div className="relative">
          <button onClick={() => setShareMenuOpen((o) => !o)} className="w-full py-2 bg-indigo-600 font-bold rounded-lg text-center text-white shadow-sm">
            Share 📤
          </button>
          {shareMenuOpen && (
            <div className="absolute bottom-full mb-1 left-0 right-0 bg-slate-800 border border-slate-700 rounded-lg overflow-hidden shadow-xl z-10">
              <button onClick={handleShareFarcaster} className="w-full px-3 py-2 text-[10px] font-bold text-left hover:bg-slate-700">
                🟣 Farcaster
              </button>
              <button onClick={handleShareX} className="w-full px-3 py-2 text-[10px] font-bold text-left hover:bg-slate-700 border-t border-slate-700">
                ✖️ X (Twitter)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
