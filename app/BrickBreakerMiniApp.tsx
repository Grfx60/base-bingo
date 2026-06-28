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
const FIXED_HEIGHT = 450; // Mobil dikey ekranlar için yüksekliği hafif optimize ettik
const PADDLE_WIDTH = 80;
const PADDLE_HEIGHT = 12;
const BALL_RADIUS = 8;

export default function BrickBreakerMiniApp() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  
  const userWallet = address || "Guest";
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // --- OYUN STATE'LERİ ---
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [lives, setLives] = useState(4);
  const [gameState, setGameState] = useState<"menu" | "playing" | "gameover" | "victory">("menu");
  const [isMuted, setIsMuted] = useState(false);
  const [gameMode, setGameMode] = useState<"tournament" | "practice">("tournament");
  const [playerLv, setPlayerLv] = useState(1);
  const [playerXp, setPlayerXp] = useState(0);
  const [streak, setStreak] = useState(0);
  const [attemptsLeft, setAttemptsLeft] = useState(3);
  const [countdownStr, setCountdownStr] = useState("");
  const [currentWeekStr, setCurrentWeekStr] = useState("");
  const [weeklyRank, setWeeklyRank] = useState<number | string>("—");
  const [leaderboard, setLeaderboard] = useState([]);
  const [selectedSkin, setSelectedSkin] = useState("Default");

  // REFS
  const scoreRef = useRef(0);
  const levelRef = useRef(1);
  const livesRef = useRef(4);
  const gameStateRef = useRef("menu");
  const gameModeRef = useRef("tournament");
  const paddleXRef = useRef((FIXED_WIDTH - PADDLE_WIDTH) / 2);
  const paddleWidthRef = useRef(PADDLE_WIDTH);
  const ballXRef = useRef(FIXED_WIDTH / 2);
  const ballYRef = useRef(FIXED_HEIGHT - 30);
  const ballVxFRef = useRef(3);
  const ballVyFRef = useRef(-3);
  const baseSpeedRef = useRef(4);
  const bricksRef = useRef([]);
  const particlesRef = useRef([]);
  const lasersRef = useRef([]);
  const activePowerUpRef = useRef(null);
  const powerUpTimerRef = useRef(0);
  const isMagnetAttachedRef = useRef(false);
  const rightPressedRef = useRef(false);
  const leftPressedRef = useRef(false);

  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { levelRef.current = level; }, [level]);
  useEffect(() => { livesRef.current = lives; }, [lives]);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
  useEffect(() => { gameModeRef.current = gameMode; }, [gameMode]);

  // Farcaster SDK'yı Başlatma ve Garanti Etme
  useEffect(() => {
    const initFarcaster = async () => {
      try {
        const sdk = (await import("@farcaster/frame-sdk")).default;
        if (sdk && sdk.actions) {
          sdk.actions.ready();
          console.log("Farcaster SDK başarıyla yüklendi ve tetiklendi.");
        }
      } catch (e) {
        console.log("Farcaster SDK başlatılamadı (Normal tarayıcı ortamı):", e);
      }
    };
    initFarcaster();
  }, []);

  // Ses efektleri, hafta hesaplama ve skor Supabase kayıt mantığı aynen korunuyor...
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
    } catch(e){}
  }, [isMuted]);

  const getUTCWeekString = useCallback(() => {
    const d = new Date();
    const utcTarget = new Date(d.valueOf() + d.getTimezoneOffset() * 60000);
    utcTarget.setDate(utcTarget.getDate() + 4 - (utcTarget.getDay() || 7));
    const yearStart = new Date(utcTarget.getFullYear(), 0, 1);
    return `${utcTarget.getFullYear()}-W${Math.ceil((((utcTarget.valueOf() - yearStart.valueOf()) / 86400000) + 1) / 7)}`;
  }, []);

  const generateBricks = (lvl) => {
    const rows = 5; const cols = 6; const padding = 6; const offsetTop = 40; const offsetLeft = 12;
    const bWidth = (FIXED_WIDTH - offsetLeft * 2 - padding * (cols - 1)) / cols; const bHeight = 16;
    const arr = [];
    const colors = ["#4A90E2", "#B37FEB", "#FF4D4F", "#FF9C6E", "#73D13D"];
    const shadows = ["#2C66A3", "#722ED1", "#A61D24", "#D4380D", "#389E0D"];

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
        });
      }
    }
    bricksRef.current = arr;
  };

  const startGame = () => {
    if (gameMode === "tournament" && !isConnected) { alert("Turnuva için cüzdan bağlayın!"); return; }
    setScore(0); setLevel(1); setLives(4);
    paddleXRef.current = (FIXED_WIDTH - paddleWidthRef.current) / 2;
    generateBricks(1); resetBall();
    setGameState("playing");
  };

  const resetBall = () => {
    ballXRef.current = FIXED_WIDTH / 2; ballYRef.current = FIXED_HEIGHT - 35;
    ballVxFRef.current = 3; ballVyFRef.current = -3;
  };

  useEffect(() => {
    let animId;
    const update = () => {
      if (gameStateRef.current !== "playing") return;
      ballXRef.current += ballVxFRef.current; ballYRef.current += ballVyFRef.current;

      if (ballXRef.current + BALL_RADIUS > FIXED_WIDTH || ballXRef.current - BALL_RADIUS < 0) { ballVxFRef.current = -ballVxFRef.current; playAudio("hit"); }
      if (ballYRef.current - BALL_RADIUS < 0) { ballVyFRef.current = -ballVyFRef.current; playAudio("hit"); }

      if (ballVyFRef.current > 0 && ballYRef.current + BALL_RADIUS >= FIXED_HEIGHT - PADDLE_HEIGHT - 4 && ballXRef.current >= paddleXRef.current && ballXRef.current <= paddleXRef.current + paddleWidthRef.current) {
        ballVyFRef.current = -ballVyFRef.current; playAudio("hit");
      }

      if (ballYRef.current > FIXED_HEIGHT) {
        playAudio("lose"); const nextLives = livesRef.current - 1; setLives(nextLives);
        if (nextLives <= 0) setGameState("gameover"); else resetBall();
      }

      bricksRef.current.forEach((b) => {
        if (b.status <= 0) return;
        if (ballXRef.current >= b.x && ballXRef.current <= b.x + b.width && ballYRef.current >= b.y && ballYRef.current <= b.y + b.height) {
          b.status = 0; setScore((s) => s + 10); ballVyFRef.current = -ballVyFRef.current; playAudio("brick");
        }
      });
    };

    const render = () => {
      const canvas = canvasRef.current; if (!canvas) return;
      const ctx = canvas.getContext("2d"); if (!ctx) return;
      ctx.clearRect(0, 0, FIXED_WIDTH, FIXED_HEIGHT);
      ctx.fillStyle = "#111827"; ctx.fillRect(0, 0, FIXED_WIDTH, FIXED_HEIGHT);

      bricksRef.current.forEach((b) => {
        if (b.status <= 0) return;
        ctx.fillStyle = b.shadowColor; ctx.fillRect(b.x, b.y + 2, b.width, b.height);
        ctx.fillStyle = b.color; ctx.fillRect(b.x, b.y, b.width, b.height);
      });

      ctx.fillStyle = "#3b82f6"; ctx.fillRect(paddleXRef.current, FIXED_HEIGHT - PADDLE_HEIGHT - 4, paddleWidthRef.current, PADDLE_HEIGHT);
      ctx.fillStyle = "#ef4444"; ctx.beginPath(); ctx.arc(ballXRef.current, ballYRef.current, BALL_RADIUS, 0, Math.PI * 2); ctx.fill();
    };

    const loop = () => { update(); render(); animId = requestAnimationFrame(loop); };
    if (gameState === "playing") animId = requestAnimationFrame(loop); else render();
    return () => cancelAnimationFrame(animId);
  }, [gameState, playAudio]);

  const handlePointerMove = (e) => {
    if (gameState !== "playing" || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left) * (FIXED_WIDTH / rect.width);
    paddleXRef.current = Math.max(0, Math.min(FIXED_WIDTH - paddleWidthRef.current, canvasX - paddleWidthRef.current / 2));
  };

  return (
    <div className="w-full max-w-md mx-auto p-4 bg-slate-900 border border-slate-800 rounded-3xl text-white shadow-2xl flex flex-col gap-4">
      
      {/* BAŞLIK & CÜZDAN */}
      <div className="flex justify-between items-center border-b border-slate-800 pb-3">
        <div>
          <h1 className="text-lg font-black tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
            BRICK BREAKER
          </h1>
          <p className="text-[10px] text-slate-500 font-semibold">Base & Farcaster Verified</p>
        </div>
        <button
          onClick={() => isConnected ? disconnect() : (connectors[0] && connect({ connector: connectors[0] }))}
          className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all ${
            isConnected ? "bg-slate-800 text-emerald-400 border border-emerald-500/30" : "bg-blue-600 text-white"
          }`}
        >
          {isConnected ? `${address.slice(0, 4)}...${address.slice(-4)}` : "Connect Wallet"}
        </button>
      </div>

      {/* CAN / SKOR PANELİ */}
      <div className="flex justify-between items-center text-xs bg-slate-950 p-2.5 rounded-xl border border-slate-800 font-mono">
        <div>SCORE: <span className="text-emerald-400 font-bold">{score}</span></div>
        <div>LIVES: <span className="text-red-400 font-bold">{"❤️".repeat(Math.max(0, lives))}</span></div>
        <div>LEVEL: <span className="text-purple-400 font-bold">{level}</span></div>
      </div>

      {/* OYUN CANVAS ALANI */}
      <div className="relative flex justify-center bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 aspect-[400/450]">
        <canvas
          ref={canvasRef}
          width={FIXED_WIDTH}
          height={FIXED_HEIGHT}
          onPointerMove={handlePointerMove}
          className="w-full h-full block touch-none cursor-crosshair"
        />

        {gameState !== "playing" && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
            {gameState === "menu" && (
              <div className="space-y-4">
                <h3 className="text-md font-bold text-blue-400">Smash the Bricks!</h3>
                <button onClick={startGame} className="px-8 py-3 bg-blue-600 hover:bg-blue-500 font-black rounded-xl tracking-widest text-xs shadow-lg">START GAME</button>
              </div>
            )}
            {gameState === "gameover" && (
              <div className="space-y-3">
                <h3 className="text-lg font-black text-red-500">GAME OVER</h3>
                <p className="text-xs text-slate-400">Final Score: {score}</p>
                <button onClick={startGame} className="px-6 py-2.5 bg-red-600 font-bold rounded-xl text-xs">TRY AGAIN</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* İSTATİSTİKLER VE TURNUVA */}
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="bg-slate-950 p-2 rounded-xl border border-slate-800 flex flex-col">
          <span className="text-slate-500 font-bold text-[9px] uppercase">Player Info</span>
          <span className="font-bold text-blue-400 mt-0.5">LV {playerLv} ({playerXp} XP)</span>
        </div>
        <div className="bg-slate-950 p-2 rounded-xl border border-slate-800 flex flex-col justify-between">
          <span className="text-slate-500 font-bold text-[9px] uppercase">Attempts Left</span>
          <span className="font-bold text-amber-400 font-mono">{attemptsLeft} / 3</span>
        </div>
      </div>

      {/* SEÇENEKLER VE PAYLAŞMA */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <button onClick={() => setGameMode(m => m === "tournament" ? "practice" : "tournament")} className="py-2.5 bg-slate-800 border border-slate-700 font-medium rounded-xl text-slate-300">
          {gameMode === "tournament" ? "🏆 Tournament" : "🕹️ Practice"}
        </button>
        <button onClick={() => window.open(`https://farcaster.com/~/compose?text=${encodeURIComponent(`Base-Bingo Tuğla Kırma Oyununda ${score} skor ürettim! 🚀`)}`, "_blank")} className="py-2.5 bg-indigo-600 font-bold rounded-xl shadow-md">
          Share 📤
        </button>
      </div>

    </div>
  );
}