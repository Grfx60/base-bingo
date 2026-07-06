/* eslint-disable */
// @ts-nocheck
"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { useAccount, useConnect, useDisconnect, useSendTransaction } from "wagmi";
import { parseEther } from "viem";

const GAME_FEE_RECIPIENT = "0xBe96fB12585Bd1cd2822Ae451A69eA5E8970806F";
const GAME_FEE_AMOUNT = parseEther("0.00001");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const safeUrl = supabaseUrl.startsWith("http") ? supabaseUrl : "https://dummy.supabase.co";
const supabase = createClient(safeUrl, supabaseAnonKey || "dummy-key");

const W = 390, H = 430, PW = 80, PH = 14, BR = 8;

const ROW_COLORS = [
  { top: "#ff6b9d", mid: "#ff2d78", bot: "#9e0040", shine: "rgba(255,200,220,0.65)" },
  { top: "#ffaa60", mid: "#ff6000", bot: "#aa3000", shine: "rgba(255,210,160,0.65)" },
  { top: "#ffe566", mid: "#ffc800", bot: "#aa8000", shine: "rgba(255,245,160,0.65)" },
  { top: "#80e860", mid: "#40c000", bot: "#208000", shine: "rgba(180,255,150,0.65)" },
  { top: "#60e8e8", mid: "#00b8d0", bot: "#006080", shine: "rgba(150,240,255,0.65)" },
  { top: "#c080ff", mid: "#7040ff", bot: "#3800c0", shine: "rgba(210,180,255,0.65)" },
];

export default function BrickBreakerMiniApp() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { sendTransactionAsync } = useSendTransaction();
  const canvasRef = useRef(null);

  const [isPaying, setIsPaying] = useState(false);
  const [paymentError, setPaymentError] = useState(null);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [lives, setLives] = useState(4);
  const [gameState, setGameState] = useState("menu");
  const [isMuted, setIsMuted] = useState(false);
  const [gameMode, setGameMode] = useState("tournament");
  const [playerLv, setPlayerLv] = useState(1);
  const [playerXp, setPlayerXp] = useState(0);
  const [xpGained, setXpGained] = useState(0);
  const [isSdkLoaded, setIsSdkLoaded] = useState(false);
  const [activePowerUp, setActivePowerUp] = useState(null);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [leaderboardRows, setLeaderboardRows] = useState([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [bestScore, setBestScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [showCombo, setShowCombo] = useState(false);
  const [isNewHigh, setIsNewHigh] = useState(false);
  const [puCounts, setPuCounts] = useState({ WIDE: 0, FIRE: 0, LIFE: 0, FREEZE: 0 });
  const [prevState, setPrevState] = useState("menu");
  const [isPaused, setIsPaused] = useState(false);
  const pausedRef = useRef(false);

  const scoreRef = useRef(0);
  const levelRef = useRef(1);
  const livesRef = useRef(4);
  const gsRef = useRef("menu");
  const pxRef = useRef((W - PW) / 2);
  const pwRef = useRef(PW);
  const bxRef = useRef(W / 2);
  const byRef = useRef(H - 40);
  const vxRef = useRef(1.8);
  const vyRef = useRef(-1.8);
  const bricksRef = useRef([]);
  const trailRef = useRef([]);
  const puRef = useRef([]);
  const frozenRef = useRef(false);
  const fireRef = useRef(false);
  const ptcRef = useRef([]);
  const comboRef = useRef(0);
  const bestRef = useRef(0);
  const bgMusicRef = useRef(null);

  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { levelRef.current = level; }, [level]);
  useEffect(() => { livesRef.current = lives; }, [lives]);
  useEffect(() => { gsRef.current = gameState; }, [gameState]);
  useEffect(() => { bestRef.current = bestScore; }, [bestScore]);
  useEffect(() => { pausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { const req = playerLv * 100; if (playerXp >= req) { setPlayerLv(l => l + 1); setPlayerXp(x => x - req); } }, [playerXp, playerLv]);
  useEffect(() => { const init = async () => { try { const { sdk } = await import("@farcaster/miniapp-sdk"); if (sdk) { await sdk.actions.init(); setIsSdkLoaded(true); await sdk.actions.ready(); } } catch (e) { setIsSdkLoaded(true); } }; init(); }, []);

  // Background music for menu
  useEffect(() => {
    const startBgMusic = () => {
      try {
        const A = window.AudioContext || window.webkitAudioContext;
        if (!A) return null;
        const ctx = new A();
        const masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(0.025, ctx.currentTime);
        masterGain.connect(ctx.destination);
        const freqs = [220, 277.18, 329.63, 440];
        const oscillators = freqs.map((freq, i) => {
          const osc = ctx.createOscillator();
          osc.type = ["sine", "triangle", "sine", "sine"][i % 4];
          osc.frequency.setValueAtTime(freq, ctx.currentTime);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.015 - i * 0.002, ctx.currentTime);
          osc.connect(g);
          g.connect(masterGain);
          osc.start();
          return osc;
        });
        return { ctx, oscillators };
      } catch (e) { return null; }
    };
    if (gameState === "menu" && !isMuted) {
      if (!bgMusicRef.current) bgMusicRef.current = startBgMusic();
    } else if (bgMusicRef.current) {
      try { bgMusicRef.current.ctx.close(); } catch (e) {}
      bgMusicRef.current = null;
    }
    return () => {
      if (bgMusicRef.current) {
        try { bgMusicRef.current.ctx.close(); } catch (e) {}
        bgMusicRef.current = null;
      }
    };
  }, [gameState, isMuted]);

  const audio = useCallback((t) => {
    if (isMuted) return;
    try { const A = window.AudioContext || window.webkitAudioContext; if (!A) return; const c = new A(), o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); const freqs = { hit: 180, brick: 380, lose: 100, powerup: 520, levelup: 700 }; o.frequency.setValueAtTime(freqs[t] || 300, c.currentTime);       const vol = { hit: 0.08, brick: 0.25, lose: 0.15, powerup: 0.12, levelup: 0.15 }; g.gain.setValueAtTime(vol[t] || 0.08, c.currentTime); o.start(); o.stop(c.currentTime + (t === "lose" ? 0.4 : t === "levelup" ? 0.4 : 0.08)); } catch (e) {}
  }, [isMuted]);

  const submitScore = useCallback(async (s, l) => {
    if (!address || s <= 0) return;
    if (s > bestRef.current) { setBestScore(s); setIsNewHigh(true); }
    try { await supabase.rpc("upsert_best_score", { p_wallet: address, p_score: s, p_level: l }); } catch (e) {}
  }, [address]);

  const fetchLB = useCallback(async () => {
    setLeaderboardLoading(true);
    try { const { data } = await supabase.from("leaderboard").select("wallet_address, best_score, best_level").order("best_score", { ascending: false }).limit(10); setLeaderboardRows(data || []); } catch (e) { setLeaderboardRows([]); } finally { setLeaderboardLoading(false); }
  }, []);

  const spawnPtc = (bx, by, bw, bh, color) => {
    for (let i = 0; i < 8; i++) ptcRef.current.push({ x: bx + bw / 2 + (Math.random() - 0.5) * bw * 0.7, y: by + bh / 2 + (Math.random() - 0.5) * bh, vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 5 - 1.5, life: 1, decay: 0.05 + Math.random() * 0.05, size: 2.5 + Math.random() * 4, color });
  };

  const genBricks = (lv = 1) => {
    const rows = 5 + Math.floor((lv - 1) / 5), cols = 7, pad = 5, oTop = 16, oLeft = 8;
    const bw = (W - oLeft * 2 - pad * (cols - 1)) / cols, bh = 18;
    const arr = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) arr.push({ x: c * (bw + pad) + oLeft, y: r * (bh + pad) + oTop, width: bw, height: bh, status: 1, rc: ROW_COLORS[r % ROW_COLORS.length], pu: null });
    const shuf = arr.map((_, i) => i);
    for (let i = shuf.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shuf[i], shuf[j]] = [shuf[j], shuf[i]]; }
    let cnt = 0, cur = 0;
    if (lv % 3 === 0) { arr[shuf[cur++]].pu = "LIFE"; cnt++; }
    const types = ["FREEZE", "FIRE", "WIDE"];
    for (; cur < shuf.length && cnt < 5; cur++) if (Math.random() < 0.14) { arr[shuf[cur]].pu = types[Math.floor(Math.random() * 3)]; cnt++; }
    bricksRef.current = arr;
  };

  const resetBall = (lv = levelRef.current) => {
    bxRef.current = W / 2; byRef.current = H - 48;
    let sp = 1.8 + (lv - 1) * 0.12;
    if (frozenRef.current) sp *= 0.5;
    vxRef.current = Math.random() > 0.5 ? sp : -sp; vyRef.current = -sp; trailRef.current = [];
  };

  const startGame = async () => {
    if (!isConnected) { alert("Please connect your wallet first!"); return; }
    setPaymentError(null);
    if (gameMode === "tournament") {
      setIsPaying(true);
      try { await sendTransactionAsync({ to: GAME_FEE_RECIPIENT, value: GAME_FEE_AMOUNT }); } catch { setPaymentError("Payment rejected."); setIsPaying(false); return; }
      setIsPaying(false);
    }
    setScore(0); setLevel(1); setLives(4); setXpGained(0); setCombo(0); setIsNewHigh(false);
    setPuCounts({ WIDE: 0, FIRE: 0, LIFE: 0, FREEZE: 0 }); setActivePowerUp(null);
    pwRef.current = PW; puRef.current = []; frozenRef.current = false; fireRef.current = false;
    trailRef.current = []; ptcRef.current = []; comboRef.current = 0;
    pxRef.current = (W - PW) / 2; genBricks(1); resetBall(1); setGameState("playing");
  };

  const checkVic = () => {
    if (!bricksRef.current.some(b => b.status === 1)) {
      audio("levelup");
      const gained = Math.floor(comboRef.current * 5 + 50 + levelRef.current * 10);
      setXpGained(gained); setPlayerXp(x => x + gained); setLevel(l => l + 1); setGameState("levelup");
    }
  };

  const nextLevel = () => {
    genBricks(levelRef.current); resetBall(levelRef.current);
    setActivePowerUp(null); puRef.current = []; frozenRef.current = false; fireRef.current = false;
    ptcRef.current = []; comboRef.current = 0; setCombo(0);
    setPuCounts({ WIDE: 0, FIRE: 0, LIFE: 0, FREEZE: 0 }); setGameState("playing");
  };

  const openLB = () => { setPrevState(gameState); setGameState("leaderboard"); fetchLB(); };
  const avatarColor = (w) => { const cs = ["#ff2d78","#ff6000","#ffd000","#00c853","#00bcd4","#7c4dff"]; let h = 0; for (let i = 0; i < w.length; i++) h = w.charCodeAt(i) + ((h << 5) - h); return cs[Math.abs(h) % cs.length]; };

  useEffect(() => {
    let aid;

    const drawBrick = (ctx, b) => {
      if (!b.status) return;
      const { x, y, width: w, height: h, rc } = b;
      const r = 6;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 8; ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 4;
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, rc.top); g.addColorStop(0.5, rc.mid); g.addColorStop(1, rc.bot);
      ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      const sg = ctx.createLinearGradient(x, y, x, y + h * 0.55);
      sg.addColorStop(0, rc.shine); sg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = sg; ctx.beginPath(); ctx.roundRect(x + 2, y + 2, w - 4, h * 0.5, [r - 1, r - 1, 2, 2]); ctx.fill();
      if (b.pu) { const icons = { LIFE: "♥", FREEZE: "❄", FIRE: "🔥", WIDE: "↔" }; ctx.shadowBlur = 0; ctx.font = `bold ${Math.floor(h * 0.55)}px sans-serif`; ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(icons[b.pu] || "?", x + w / 2, y + h / 2 + 1); }
      ctx.restore();
    };

    const update = () => {
      if (gsRef.current !== "playing" || pausedRef.current) return;
      bxRef.current += vxRef.current; byRef.current += vyRef.current;
      trailRef.current.push({ x: bxRef.current, y: byRef.current }); if (trailRef.current.length > 12) trailRef.current.shift();
      if (bxRef.current + BR > W || bxRef.current - BR < 0) { vxRef.current = -vxRef.current; audio("hit"); }
      if (byRef.current - BR < 0) { vyRef.current = -vyRef.current; audio("hit"); }
      if (vyRef.current > 0 && byRef.current + BR >= H - PH - 5 && bxRef.current >= pxRef.current && bxRef.current <= pxRef.current + pwRef.current) {
        // Paddle'ın hangi noktasına çarptığını hesapla (-1: sol kenar, 0: merkez, +1: sağ kenar)
        const hitFactor = ((bxRef.current - pxRef.current) / pwRef.current - 0.5) * 2;
        // Mevcut topun hızı (magnitude)
        const speed = Math.sqrt(vxRef.current * vxRef.current + vyRef.current * vyRef.current);
        // Maksimum 65 derece açı — kenara yakın çarparsa daha sert yönlenir
        const maxAngle = 65 * (Math.PI / 180);
        const angle = hitFactor * maxAngle;
        vxRef.current = speed * Math.sin(angle);
        vyRef.current = -Math.abs(speed * Math.cos(angle)); // her zaman yukarı gitsin
        // Minimum yatay hız garantisi (top tamamen dikey gitmesin)
        if (Math.abs(vxRef.current) < 0.4) vxRef.current = hitFactor >= 0 ? 0.4 : -0.4;
        audio("hit"); comboRef.current = 0; setCombo(0);
      }
      if (byRef.current > H) { audio("lose"); comboRef.current = 0; setCombo(0); const nl = livesRef.current - 1; setLives(nl); if (nl <= 0) { setGameState("gameover"); submitScore(scoreRef.current, levelRef.current); } else resetBall(); }
      ptcRef.current = ptcRef.current.filter(p => p.life > 0); ptcRef.current.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.2; p.life -= p.decay; });
      bricksRef.current.forEach(b => {
        if (!b.status) return;
        if (bxRef.current >= b.x && bxRef.current <= b.x + b.width && byRef.current >= b.y && byRef.current <= b.y + b.height) {
          b.status = 0; comboRef.current++; const pts = 10 + (comboRef.current > 1 ? comboRef.current * 5 : 0);
          setScore(s => s + pts); setCombo(comboRef.current); setShowCombo(true); setTimeout(() => setShowCombo(false), 900);
          setPlayerXp(x => x + 5); spawnPtc(b.x, b.y, b.width, b.height, b.rc.mid); audio("brick");
          if (!fireRef.current) vyRef.current = -vyRef.current;
          if (b.pu) puRef.current.push({ x: b.x + b.width / 2, y: b.y + b.height, type: b.pu });
          checkVic();
        }
      });
      puRef.current.forEach((p, i) => {
        p.y += 1.5;
        if (p.y >= H - PH - 12 && p.y <= H && p.x >= pxRef.current && p.x <= pxRef.current + pwRef.current) {
          audio("powerup"); setPuCounts(prev => ({ ...prev, [p.type]: (prev[p.type] || 0) + 1 }));
          if (p.type === "WIDE") { pwRef.current = PW * 1.5; setActivePowerUp("EXPAND"); setTimeout(() => { pwRef.current = PW; setActivePowerUp(null); }, 6000); }
          else if (p.type === "LIFE") setLives(l => Math.min(l + 1, 6));
          else if (p.type === "FREEZE" && !frozenRef.current) { frozenRef.current = true; vxRef.current *= 0.5; vyRef.current *= 0.5; setActivePowerUp("SLOW BALL"); setTimeout(() => { frozenRef.current = false; vxRef.current *= 2; vyRef.current *= 2; setActivePowerUp(null); }, 6000); }
          else if (p.type === "FIRE") { fireRef.current = true; setActivePowerUp("FIRE BALL"); setTimeout(() => { fireRef.current = false; setActivePowerUp(null); }, 6000); }
          puRef.current.splice(i, 1);
        } else if (p.y > H) puRef.current.splice(i, 1);
      });
    };

    const render = () => {
      const cv = canvasRef.current; if (!cv) return;
      const ctx = cv.getContext("2d"); if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      const bg = ctx.createLinearGradient(0, 0, W, H); bg.addColorStop(0, "#060418"); bg.addColorStop(0.5, "#0a0628"); bg.addColorStop(1, "#060418");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      ctx.save(); for (let i = 0; i < 50; i++) { ctx.fillStyle = `rgba(255,255,255,${0.04 + (i % 4) * 0.025})`; ctx.beginPath(); ctx.arc((i * 89) % W, (i * 67 + 20) % H, i % 4 === 0 ? 1.3 : 0.7, 0, Math.PI * 2); ctx.fill(); } ctx.restore();
      bricksRef.current.forEach(b => drawBrick(ctx, b));
      ptcRef.current.forEach(p => { ctx.save(); ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 8; ctx.beginPath(); ctx.roundRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size, 2); ctx.fill(); ctx.restore(); });
      const pu_colors = { WIDE: "#00d4ff", LIFE: "#ff2d78", FREEZE: "#60c0ff", FIRE: "#ff8800" };
      const pu_labels = { WIDE: "E", LIFE: "♥", FREEZE: "❄", FIRE: "F" };
      puRef.current.forEach(p => { const pc = pu_colors[p.type] || "#fff"; ctx.save(); ctx.shadowColor = pc; ctx.shadowBlur = 18; ctx.strokeStyle = pc; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, 13, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = pc + "35"; ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = "#fff"; ctx.font = "bold 9px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(pu_labels[p.type] || "?", p.x, p.y + 0.5); ctx.restore(); });
      const py = H - PH - 5; ctx.save(); ctx.shadowColor = "#4080ff"; ctx.shadowBlur = 28;
      const pg = ctx.createLinearGradient(pxRef.current, py, pxRef.current, py + PH); pg.addColorStop(0, "#90c0ff"); pg.addColorStop(0.45, "#4080ff"); pg.addColorStop(1, "#1040b0");
      ctx.fillStyle = pg; ctx.beginPath(); ctx.roundRect(pxRef.current, py, pwRef.current, PH, PH / 2); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.beginPath(); ctx.roundRect(pxRef.current + pwRef.current * 0.08, py + 3, pwRef.current * 0.84, 2.5, 2); ctx.fill(); ctx.restore();
      let bc = "#ff3070", bg2 = "#ff1050"; if (fireRef.current) { bc = "#ff8800"; bg2 = "#ff5500"; } else if (frozenRef.current) { bc = "#60c0ff"; bg2 = "#40a0ff"; }
      trailRef.current.forEach((t, i) => { ctx.save(); ctx.globalAlpha = (i / trailRef.current.length) * 0.45; ctx.fillStyle = bc; ctx.beginPath(); ctx.arc(t.x, t.y, BR * (0.3 + i / trailRef.current.length * 0.7), 0, Math.PI * 2); ctx.fill(); ctx.restore(); });
      ctx.save(); ctx.shadowColor = bg2; ctx.shadowBlur = 30;
      const bgr = ctx.createRadialGradient(bxRef.current - 2.5, byRef.current - 2.5, 1, bxRef.current, byRef.current, BR); bgr.addColorStop(0, "#fff"); bgr.addColorStop(0.35, bc); bgr.addColorStop(1, bg2);
      ctx.fillStyle = bgr; ctx.beginPath(); ctx.arc(bxRef.current, byRef.current, BR, 0, Math.PI * 2); ctx.fill();
      if (fireRef.current || frozenRef.current) { ctx.strokeStyle = fireRef.current ? "rgba(255,140,0,0.7)" : "rgba(96,192,255,0.7)"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(bxRef.current, byRef.current, BR + 4, 0, Math.PI * 2); ctx.stroke(); } ctx.restore();
    };

    const loop = () => { update(); render(); aid = requestAnimationFrame(loop); };
    if (gameState === "playing" || gameState === "gameover" || gameState === "menu") { aid = requestAnimationFrame(loop); } else render();
    return () => cancelAnimationFrame(aid);
  }, [gameState, audio, level]);

  const onMove = (e) => { if (gsRef.current !== "playing" || !canvasRef.current) return; const r = canvasRef.current.getBoundingClientRect(); const cx = (e.clientX - r.left) * (W / r.width); pxRef.current = Math.max(0, Math.min(W - pwRef.current, cx - pwRef.current / 2)); };
  const onTouch = (e) => { if (gsRef.current !== "playing" || !canvasRef.current || !e.touches.length) return; if (e.cancelable) e.preventDefault(); const r = canvasRef.current.getBoundingClientRect(); const cx = (e.touches[0].clientX - r.left) * (W / r.width); pxRef.current = Math.max(0, Math.min(W - pwRef.current, cx - pwRef.current / 2)); };
  const wt = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error("t")), ms))]);
  const refCode = address ? address.slice(2, 8).toUpperCase() : "GUEST";
  const shareText = () => `Base Brick Breaker'da ${level}. seviyeye ulaşıp ${score} puanla çıtayı buraya koydum.\nAranızda bu skoru geçebilecek bir "Brick Master" var mı? Hodri meydan! 🔥`;
  const refLink = () => { if (typeof window === "undefined") return ""; const u = new URL(window.location.href); u.searchParams.set("ref", refCode); return u.toString(); };
  const fallbackShare = async () => { try { if (navigator.share) await navigator.share({ text: shareText(), url: refLink() }); else { await navigator.clipboard.writeText(`${shareText()} ${refLink()}`); alert("Copied!"); } } catch (e) {} };
  const shareFarcaster = async () => { setShareMenuOpen(false); try { const { sdk } = await import("@farcaster/miniapp-sdk"); const inApp = await wt(sdk.isInMiniApp(), 1000).catch(() => false); if (!inApp) { await fallbackShare(); return; } await wt(sdk.actions.composeCast({ text: shareText(), embeds: [refLink()] }), 2000); } catch (e) { await fallbackShare(); } };
  const shareX = async () => { setShareMenuOpen(false); const xu = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText())}&url=${encodeURIComponent(refLink())}`; try { const { sdk } = await import("@farcaster/miniapp-sdk"); const inApp = await wt(sdk.isInMiniApp(), 1000).catch(() => false); if (!inApp) { window.open(xu, "_blank"); return; } await wt(sdk.actions.openUrl(xu), 1500); } catch (e) { window.open(xu, "_blank"); } };

  if (!isSdkLoaded) return <div style={{ background: "#060418", color: "#fff", padding: 40, textAlign: "center", borderRadius: 16, minHeight: 200 }}>Loading...</div>;

  const C = {
    app: { background: "linear-gradient(160deg, #060418 0%, #0c0828 50%, #060418 100%)", borderRadius: 20, overflow: "hidden", maxWidth: 440, margin: "0 auto" },
    hdr: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px 8px", borderBottom: "1px solid rgba(255,255,255,0.07)" },
    t1: { color: "#fff", fontWeight: 900, fontSize: 16, letterSpacing: 1, lineHeight: 1, textShadow: "0 0 18px rgba(120,80,255,0.9)" },
    t2: { color: "#ff6035", fontWeight: 900, fontSize: 18, letterSpacing: 1, lineHeight: 1.05, textShadow: "0 0 18px rgba(255,100,50,0.8)" },
    t3: { color: "#504070", fontSize: 8, fontWeight: 700, letterSpacing: 2, marginTop: 2 },
    wb: (c) => ({ padding: "5px 10px", borderRadius: 20, fontWeight: 700, fontSize: 11, cursor: "pointer", border: "none", background: c ? "rgba(0,200,100,0.12)" : "#4060ff", color: c ? "#00d070" : "#fff" }),
    sb: { display: "flex", justifyContent: "space-around", alignItems: "center", padding: "6px 14px", background: "rgba(0,0,0,0.35)", borderBottom: "1px solid rgba(255,255,255,0.05)" },
    sep: { width: 1, height: 26, background: "rgba(255,255,255,0.07)" },
    lbl: { color: "#504080", fontSize: 8, fontWeight: 700, letterSpacing: 1.5, textAlign: "center" },
    sv: (c) => ({ color: c, fontWeight: 900, fontSize: 15, textAlign: "center" },),
    btn: (bg, c, extra = {}) => ({ ...extra, padding: "13px", borderRadius: 14, fontWeight: 900, fontSize: 13, cursor: "pointer", border: "none", background: bg, color: c, letterSpacing: 1 }),
    obtn: (bc, bg, c) => ({ padding: "11px 8px", borderRadius: 14, fontWeight: 700, fontSize: 10, cursor: "pointer", border: `1px solid ${bc}`, background: bg, color: c }),
    card: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "10px 6px", textAlign: "center" },
    sml: { color: "#504070", fontSize: 8, fontWeight: 700, letterSpacing: 1.5 },
  };

  const ShareMenu = ({ pos = "bottom" }) => shareMenuOpen && (
    <div style={{ position: "absolute", [pos === "bottom" ? "bottom" : "top"]: "110%", right: 0, background: "#140c38", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, overflow: "hidden", zIndex: 20, minWidth: 140 }}>
      <button onClick={shareFarcaster} style={{ width: "100%", padding: "10px 14px", background: "none", border: "none", color: "#c080ff", fontWeight: 700, fontSize: 11, cursor: "pointer", textAlign: "left" }}>🟣 Farcaster</button>
      <button onClick={shareX} style={{ width: "100%", padding: "10px 14px", background: "none", border: "none", color: "#b0b0c0", fontWeight: 700, fontSize: 11, cursor: "pointer", textAlign: "left", borderTop: "1px solid rgba(255,255,255,0.07)" }}>✖️ X (Twitter)</button>
    </div>
  );

  return (
    <div style={C.app}>

      {/* ===== MENU ===== */}
      {gameState === "menu" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "18px 16px 16px", gap: 12, minHeight: 600 }}>
          <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div><div style={C.t1}>BASE BRICK</div><div style={C.t2}>BREAKER</div><div style={C.t3}>CLASSIC ARCADE EDITION</div></div>
            <button style={C.wb(isConnected)} onClick={() => isConnected ? disconnect() : (connectors[0] && connect({ connector: connectors[0] }))}>
              {isConnected ? `${address.slice(0, 4)}...${address.slice(-4)}` : "Connect Wallet"}
            </button>
          </div>

          {/* Canvas preview */}
          <div style={{ width: "100%", borderRadius: 18, overflow: "hidden", position: "relative", height: 195, border: "1px solid rgba(120,80,255,0.25)", background: "#060418" }}>
            <canvas ref={canvasRef} width={W} height={H} style={{ width: "100%", height: "100%", display: "block", objectFit: "cover", opacity: 0.55 }} />
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, pointerEvents: "none" }}>
              <div style={{ width: 55, height: 55, borderRadius: "50%", background: "radial-gradient(circle at 32% 28%, #fff, #c060ff)", boxShadow: "0 0 50px #8040ff, 0 0 100px rgba(128,64,255,0.4)" }} />
              <div style={{ width: 110, height: 13, borderRadius: 7, background: "linear-gradient(90deg, #70b0ff, #4080ff, #70b0ff)", boxShadow: "0 0 20px #4080ff" }} />
            </div>
          </div>

          <div style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {[{ l: "BEST SCORE", v: bestScore, c: "#ffd000" }, { l: "PLAYER LV", v: playerLv, c: "#b060ff" }, { l: "XP", v: playerXp, c: "#00d070" }].map(s => (
              <div key={s.l} style={C.card}><div style={C.sml}>{s.l}</div><div style={{ color: s.c, fontWeight: 900, fontSize: 20, marginTop: 3 }}>{s.v}</div></div>
            ))}
          </div>

          <div style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {(["tournament", "practice"]).map(m => (
              <button key={m} onClick={() => setGameMode(m)} style={{ ...C.obtn(gameMode === m ? "#6060ff" : "rgba(255,255,255,0.08)", gameMode === m ? "rgba(60,60,255,0.2)" : "rgba(255,255,255,0.04)", gameMode === m ? "#9090ff" : "#504080"), padding: "10px" }}>
                {m === "tournament" ? "🏆 TOURNAMENT" : "🕹️ PRACTICE"}
              </button>
            ))}
          </div>
          {gameMode === "tournament" && <div style={{ color: "#ff7040", fontSize: 9, fontWeight: 700, marginTop: -4 }}>0.00001 ETH per game on Base Network</div>}

          <button onClick={startGame} disabled={isPaying} style={{ ...C.btn("linear-gradient(135deg, #ff2060 0%, #ff6000 100%)", "#fff", { width: "100%", boxShadow: "0 0 30px rgba(255,50,50,0.45)", opacity: isPaying ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 16 }) }}>
            {isPaying ? "CONFIRMING..." : "▶  PLAY NOW"}
          </button>
          {paymentError && <div style={{ color: "#ff4060", fontSize: 10, textAlign: "center" }}>{paymentError}</div>}

          <div style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <button onClick={openLB} style={{ ...C.obtn("rgba(255,200,0,0.28)", "rgba(255,200,0,0.08)", "#ffd000"), padding: "12px 4px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, fontSize: 9 }}>
              <span style={{ fontSize: 18 }}>🏆</span>LEADERBOARD
            </button>
            <button onClick={() => setIsMuted(m => !m)} style={{ ...C.obtn("rgba(255,255,255,0.1)", "rgba(255,255,255,0.04)", "#808090"), padding: "12px 4px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, fontSize: 9 }}>
              <span style={{ fontSize: 18 }}>{isMuted ? "🔇" : "🎵"}</span>{isMuted ? "UNMUTE" : "SOUND"}
            </button>
            <div style={{ position: "relative" }}>
              <button onClick={() => setShareMenuOpen(o => !o)} style={{ ...C.obtn("rgba(100,100,255,0.28)", "rgba(100,100,255,0.08)", "#a0a0ff"), padding: "12px 4px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, fontSize: 9, width: "100%" }}>
                <span style={{ fontSize: 18 }}>📤</span>SHARE
              </button>
              <ShareMenu />
            </div>
          </div>
        </div>
      )}

      {/* ===== GAME SCREEN ===== */}
      {(gameState === "playing" || gameState === "gameover") && (
        <div>
          <div style={C.hdr}>
            <div><div style={{ ...C.t1, fontSize: 13 }}>BASE BRICK</div><div style={{ ...C.t2, fontSize: 14 }}>BREAKER</div></div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button onClick={() => setIsPaused(p => !p)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#fff", opacity: 0.7 }}>
                {isPaused ? "▶" : "⏸"}
              </button>
              <button style={C.wb(isConnected)} onClick={() => isConnected ? disconnect() : (connectors[0] && connect({ connector: connectors[0] }))}>
                {isConnected ? `${address.slice(0, 4)}...${address.slice(-4)}` : "Connect"}
              </button>
            </div>
          </div>

          <div style={C.sb}>
            <div><div style={C.lbl}>SCORE</div><div style={{ color: "#00e5ff", fontWeight: 900, fontSize: 15, textAlign: "center" }}>{score}</div></div>
            <div style={C.sep} />
            <div><div style={C.lbl}>LIVES</div><div style={{ color: "#ff3070", fontWeight: 900, fontSize: 14, textAlign: "center" }}>{"❤️".repeat(Math.max(0, lives))}</div></div>
            <div style={C.sep} />
            <div><div style={C.lbl}>LEVEL</div><div style={{ color: "#b060ff", fontWeight: 900, fontSize: 15, textAlign: "center" }}>{level}</div></div>
          </div>

          <div style={{ position: "relative" }}>
            <canvas ref={canvasRef} width={W} height={H} onPointerMove={onMove} onTouchMove={onTouch} onTouchStart={onTouch} style={{ width: "100%", display: "block", touchAction: "none", cursor: "crosshair" }} />
            {showCombo && combo > 1 && <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", color: "#ffd000", fontWeight: 900, fontSize: 15, textShadow: "0 0 12px #ffd000", pointerEvents: "none", whiteSpace: "nowrap" }}>x{combo} COMBO! 🔥</div>}
            {activePowerUp && <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,200,255,0.18)", border: "1px solid rgba(0,200,255,0.45)", borderRadius: 8, padding: "3px 8px", color: "#00e5ff", fontSize: 9, fontWeight: 700 }}>{activePowerUp} ACTIVE</div>}

            {isPaused && (
              <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
                <div style={{ fontWeight: 900, fontSize: 36, letterSpacing: 4, color: "#fff", textShadow: "0 0 30px rgba(120,80,255,0.8)" }}>PAUSED</div>
                <button onClick={() => setIsPaused(false)} style={{ padding: "14px 32px", borderRadius: 14, background: "linear-gradient(135deg, #7040ff, #4020b0)", border: "none", color: "#fff", fontWeight: 900, fontSize: 14, cursor: "pointer", boxShadow: "0 0 30px rgba(120,64,255,0.5)" }}>
                  ▶  RESUME
                </button>
              </div>
            )}

            {gameState === "gameover" && (
              <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.88)", backdropFilter: "blur(5px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
                <div style={{ fontWeight: 900, fontSize: 40, letterSpacing: 4, background: "linear-gradient(135deg, #ff2d78, #ff8800)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", textShadow: "0 0 40px rgba(255,45,120,0.3)" }}>GAME OVER</div>
                {isNewHigh && <div style={{ color: "#ffd000", fontWeight: 700, fontSize: 14, letterSpacing: 1, textShadow: "0 0 20px rgba(255,200,0,0.5)" }}>🌟 NEW HIGH SCORE!</div>}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, background: "rgba(255,255,255,0.06)", borderRadius: 18, padding: "16px 20px", border: "1px solid rgba(255,255,255,0.12)" }}>
                  {[{ l: "SCORE", v: score, c: "#fff" }, { l: "BEST", v: Math.max(score, bestScore), c: "#ffd000" }, { l: "LEVEL", v: level, c: "#b060ff" }].map(s => (
                    <div key={s.l} style={{ textAlign: "center" }}><div style={C.lbl}>{s.l}</div><div style={{ color: s.c, fontWeight: 900, fontSize: 20, textShadow: `0 0 12px ${s.c}40` }}>{s.v.toLocaleString()}</div></div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 16, marginTop: 6, alignItems: "center" }}>
                  <button onClick={() => setGameState("menu")} style={{ padding: "14px 16px", borderRadius: "50%", background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", fontSize: 9, fontWeight: 700, gap: 3 }}>
                    🏠<span>HOME</span>
                  </button>
                  <button onClick={startGame} disabled={isPaying} style={{ width: 80, height: 80, borderRadius: "50%", background: "linear-gradient(135deg, #e070ff, #8030ff)", border: "2px solid rgba(200,100,255,0.5)", color: "#fff", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, gap: 2, boxShadow: "0 0 40px rgba(180,60,255,0.7), 0 0 80px rgba(180,60,255,0.3)", opacity: isPaying ? 0.6 : 1 }}>
                    <span style={{ fontSize: 24 }}>↺</span><span>RETRY</span>
                  </button>
                  <div style={{ position: "relative" }}>
                    <button onClick={() => setShareMenuOpen(o => !o)} style={{ padding: "14px 16px", borderRadius: "50%", background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", fontSize: 9, fontWeight: 700, gap: 3 }}>
                      📤<span>SHARE</span>
                    </button>
                    <ShareMenu />
                  </div>
                </div>
                {paymentError && <div style={{ color: "#ff4060", fontSize: 10 }}>{paymentError}</div>}
              </div>
            )}
          </div>

          {/* Power-ups panel */}
          <div style={{ padding: "8px 14px", background: "linear-gradient(90deg, rgba(10,5,40,0.85), rgba(30,15,60,0.85), rgba(10,5,40,0.85))", borderTop: "1px solid rgba(120,80,255,0.2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ color: "#a080ff", fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textShadow: "0 0 10px rgba(120,80,255,0.4)" }}>POWER-UPS</div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {[{ k: "WIDE", ic: "↔", lb: "EXPAND", c: "#00d4ff" }, { k: "FIRE", ic: "🔥", lb: "FIRE", c: "#ff8800" }, { k: "LIFE", ic: "❤️", lb: "EXTRA LIFE", c: "#ff2d78" }, { k: "FREEZE", ic: "❄️", lb: "SLOW BALL", c: "#60c0ff" }].map(pu => (
                <div key={pu.k} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: puCounts[pu.k] > 0 ? `${pu.c}20` : "rgba(255,255,255,0.05)", border: `1px solid ${puCounts[pu.k] > 0 ? pu.c : "rgba(255,255,255,0.07)"}`, boxShadow: puCounts[pu.k] > 0 ? `0 0 12px ${pu.c}40` : "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, opacity: puCounts[pu.k] > 0 ? 1 : 0.38 }}>{pu.ic}</div>
                  <div style={{ color: puCounts[pu.k] > 0 ? pu.c : "#504080", fontSize: 9, fontWeight: 900, textShadow: puCounts[pu.k] > 0 ? `0 0 8px ${pu.c}60` : "none" }}>{puCounts[pu.k]}</div>
                  <div style={{ color: "#504080", fontSize: 7, letterSpacing: 0.3, whiteSpace: "nowrap" }}>{pu.lb}</div>
                </div>
              ))}
            </div>
            <button onClick={() => setIsMuted(m => !m)} style={{ background: "none", border: "none", fontSize: 16, cursor: "pointer", filter: isMuted ? "grayscale(1)" : "none" }}>{isMuted ? "🔇" : "🎵"}</button>
          </div>
        </div>
      )}

      {/* ===== LEVEL UP ===== */}
      {gameState === "levelup" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "45px 20px", gap: 18, minHeight: 600, background: "linear-gradient(180deg, #06001e 0%, #18006a 50%, #06001e 100%)" }}>
          <div style={{ fontWeight: 900, fontSize: 38, letterSpacing: 3, color: "#e060ff", textShadow: "0 0 40px #c040ff, 0 0 80px rgba(200,64,255,0.35)" }}>LEVEL UP!</div>
          <div style={{ color: "#8090b0", fontWeight: 700, fontSize: 13, letterSpacing: 2.5 }}>YOU REACHED</div>
          <div style={{ fontWeight: 900, fontSize: 54, color: "#00d4ff", textShadow: "0 0 35px #00b0ff" }}>LEVEL {level}</div>
          <div style={{ width: 75, height: 75, borderRadius: "50%", background: "radial-gradient(circle at 32% 28%, #fff, #c060ff)", boxShadow: "0 0 55px #8040ff, 0 0 110px rgba(128,64,255,0.4)", margin: "8px 0" }} />
          <div style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[{ l: "SCORE", v: score, c: "#fff" }, { l: "XP GAINED", v: `+${xpGained} XP`, c: "#a070ff" }].map(s => (
              <div key={s.l} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 18, padding: 18, textAlign: "center" }}>
                <div style={C.lbl}>{s.l}</div><div style={{ color: s.c, fontWeight: 900, fontSize: 28, marginTop: 4 }}>{s.v}</div>
              </div>
            ))}
          </div>
          <button onClick={nextLevel} style={{ ...C.btn("linear-gradient(135deg, #8040ff, #5020c0)", "#fff", { width: "100%", boxShadow: "0 0 30px rgba(120,64,255,0.5)", fontSize: 16 }) }}>▶  NEXT LEVEL</button>
          <button onClick={openLB} style={{ ...C.obtn("rgba(255,200,0,0.28)", "rgba(255,200,0,0.08)", "#ffd000"), width: "100%", padding: "14px", fontSize: 12, letterSpacing: 1 }}>🏆 LEADERBOARD</button>
        </div>
      )}

      {/* ===== LEADERBOARD ===== */}
      {gameState === "leaderboard" && (
        <div style={{ minHeight: 600, display: "flex", flexDirection: "column" }}>
          <div style={C.hdr}>
            <button onClick={() => setGameState(prevState || "menu")} style={{ background: "none", border: "none", color: "#7060a0", cursor: "pointer", fontSize: 20 }}>←</button>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 20 }}>🏆</span><span style={{ color: "#fff", fontWeight: 900, fontSize: 16, letterSpacing: 1.5 }}>LEADERBOARD</span></div>
            {isConnected ? <span style={{ color: "#e060ff", fontSize: 10, fontWeight: 700 }}>{address.slice(0, 4)}...{address.slice(-4)}</span> : <span />}
          </div>

          <div style={{ display: "flex", gap: 6, padding: "10px 16px 6px" }}>
            {["GLOBAL", "FRIENDS", "TOURNAMENT"].map((t, i) => (
              <button key={t} style={{ padding: "6px 12px", borderRadius: 8, fontWeight: 700, fontSize: 10, cursor: "pointer", border: "none", background: i === 0 ? "#7040ff" : "rgba(255,255,255,0.05)", color: i === 0 ? "#fff" : "#504080" }}>{t}</button>
            ))}
          </div>

          <div style={{ padding: "6px 16px", display: "flex", flexDirection: "column", gap: 7, flex: 1, overflowY: "auto", maxHeight: 360 }}>
            {leaderboardLoading ? (
              <div style={{ color: "#504080", textAlign: "center", padding: 30 }}>Loading...</div>
            ) : leaderboardRows.length === 0 ? (
              <div style={{ color: "#504080", textAlign: "center", padding: 30, fontSize: 12 }}>No scores yet. Be the first!</div>
            ) : (
              leaderboardRows.map((row, idx) => {
                const isMe = address && row.wallet_address?.toLowerCase() === address.toLowerCase();
                const medals = ["🥇", "🥈", "🥉"];
                const ac = avatarColor(row.wallet_address);
                return (
                  <div key={row.wallet_address} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 14, background: idx === 0 ? "rgba(255,200,0,0.1)" : isMe ? "rgba(120,60,255,0.18)" : "rgba(255,255,255,0.04)", border: `1px solid ${idx === 0 ? "rgba(255,200,0,0.3)" : isMe ? "rgba(120,60,255,0.38)" : "rgba(255,255,255,0.06)"}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 22, textAlign: "center", fontWeight: 900, color: idx < 3 ? "#ffd000" : "#504080", fontSize: idx < 3 ? 18 : 12 }}>{medals[idx] || idx + 1}</div>
                      <div style={{ width: 34, height: 34, borderRadius: "50%", background: `linear-gradient(135deg, ${ac}, ${ac}80)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: 11, border: `2px solid ${ac}50`, flexShrink: 0 }}>{row.wallet_address.slice(2, 4).toUpperCase()}</div>
                      <div>
                        <div style={{ color: "#e0e0f0", fontWeight: 700, fontSize: 12 }}>{row.wallet_address.slice(0, 6)}...{row.wallet_address.slice(-4)}</div>
                        {isMe && <div style={{ color: "#a070ff", fontSize: 9, fontWeight: 700 }}>YOU</div>}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: idx === 0 ? "#ffd000" : isMe ? "#c080ff" : "#00d080", fontWeight: 900, fontSize: 15 }}>{row.best_score.toLocaleString()}</div>
                      <div style={{ color: "#403060", fontSize: 9 }}>LV {row.best_level}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {address && leaderboardRows.length > 0 && !leaderboardRows.some(r => r.wallet_address?.toLowerCase() === address.toLowerCase()) && (
            <div style={{ margin: "0 16px 8px", padding: "10px 12px", borderRadius: 14, background: "rgba(120,60,255,0.12)", border: "1px solid rgba(120,60,255,0.28)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: "#8060c0", fontWeight: 900, width: 22, textAlign: "center" }}>?</span>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#6040b0", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: 10 }}>{address.slice(2, 4).toUpperCase()}</div>
                <div style={{ color: "#d0d0e0", fontSize: 11 }}>You</div>
              </div>
              <div style={{ color: "#b070ff", fontWeight: 900, fontSize: 14 }}>{score > 0 ? score.toLocaleString() : "—"}</div>
            </div>
          )}

          <div style={{ textAlign: "center", padding: "6px 0 10px", color: "#403060", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
            <span>⏱</span><span>SEASON ENDS IN: 6D 14H 32M</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "0 16px 16px" }}>
            <button onClick={startGame} disabled={isPaying} style={{ ...C.btn("linear-gradient(135deg, #e060ff, #a040ff)", "#fff", { boxShadow: "0 0 20px rgba(200,64,255,0.38)", opacity: isPaying ? 0.6 : 1, fontSize: 13 }) }}>
              {isPaying ? "..." : "▶ PLAY AGAIN"}
            </button>
            <div style={{ position: "relative" }}>
              <button onClick={() => setShareMenuOpen(o => !o)} style={{ ...C.obtn("rgba(100,80,255,0.28)", "rgba(100,80,255,0.08)", "#a090ff"), width: "100%", padding: "13px", fontSize: 12 }}>Share 📤</button>
              <ShareMenu />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
