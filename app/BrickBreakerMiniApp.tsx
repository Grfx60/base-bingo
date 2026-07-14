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
  { top: "#ff90c0", mid: "#ff2d78", bot: "#990040", shine: "rgba(255,210,230,0.72)" },
  { top: "#ffb580", mid: "#ff6000", bot: "#993600", shine: "rgba(255,225,180,0.72)" },
  { top: "#fff080", mid: "#ffcc00", bot: "#997800", shine: "rgba(255,250,180,0.72)" },
  { top: "#98f070", mid: "#44cc00", bot: "#228800", shine: "rgba(190,255,160,0.72)" },
  { top: "#78ecf8", mid: "#00c0d8", bot: "#007888", shine: "rgba(160,248,255,0.72)" },
  { top: "#cc98ff", mid: "#8040ff", bot: "#4000cc", shine: "rgba(218,188,255,0.72)" },
];

export default function BrickBreakerMiniApp() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { sendTransactionAsync } = useSendTransaction();
  const canvasRef = useRef(null);
  const bgCanvasRef = useRef(null);
  const bgMusicRef = useRef(null);

  const [isPaying, setIsPaying] = useState(false);
  const [paymentError, setPaymentError] = useState(null);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [lives, setLives] = useState(4);
  const [gameState, setGameState] = useState("menu");
  const [isPaused, setIsPaused] = useState(false);
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
  const [farcasterCtx, setFarcasterCtx] = useState(null);

  const scoreRef = useRef(0);
  const levelRef = useRef(1);
  const livesRef = useRef(4);
  const gsRef = useRef("menu");
  const pausedRef = useRef(false);
  const pxRef = useRef((W - PW) / 2);
  const pwRef = useRef(PW);
  const bxRef = useRef(W / 2);
  const byRef = useRef(H - 50);
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

  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { levelRef.current = level; }, [level]);
  useEffect(() => { livesRef.current = lives; }, [lives]);
  useEffect(() => { gsRef.current = gameState; }, [gameState]);
  useEffect(() => { pausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { bestRef.current = bestScore; }, [bestScore]);
  useEffect(() => { const req = playerLv * 100; if (playerXp >= req) { setPlayerLv(l => l + 1); setPlayerXp(x => x - req); } }, [playerXp, playerLv]);

  // ─── Farcaster SDK init (en güvenli yöntem) ───
  useEffect(() => {
    const init = async () => {
      try {
        const mod = await import("@farcaster/miniapp-sdk");
        const sdk = mod.sdk || mod.default;
        if (!sdk) { setIsSdkLoaded(true); return; }
        // context bilgisini al (Farcaster ortamında çalışıyorsa dolu gelir)
        let ctx = null;
        try { ctx = await Promise.race([sdk.context, new Promise(r => setTimeout(r, 1500))]); } catch (_) {}
        setFarcasterCtx(ctx || null);
        // ready çağrısı Farcaster'ın splash ekranını kapatır
        try { await sdk.actions.ready(); } catch (_) {}
        setIsSdkLoaded(true);
      } catch (e) { setIsSdkLoaded(true); }
    };
    init();
  }, []);

  // ─── Arka plan müziği ───
  const startBgMusic = useCallback(() => {
    if (isMuted || bgMusicRef.current) return;
    try {
      const A = window.AudioContext || window.webkitAudioContext;
      if (!A) return;
      const ctx = new A();
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.06, ctx.currentTime);
      master.connect(ctx.destination);
      const freqs = [110, 138.6, 165, 220];
      const oscs = freqs.map((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = i % 2 === 0 ? "sine" : "triangle";
        o.frequency.setValueAtTime(f, ctx.currentTime);
        g.gain.setValueAtTime(0.018 + i * 0.005, ctx.currentTime);
        o.connect(g); g.connect(master); o.start();
        return o;
      });
      bgMusicRef.current = { ctx, oscs, master, stop: () => { oscs.forEach(o => { try { o.stop(); } catch (_) {} }); try { ctx.close(); } catch (_) {} bgMusicRef.current = null; } };
    } catch (_) {}
  }, [isMuted]);
  const stopBgMusic = useCallback(() => { if (bgMusicRef.current) bgMusicRef.current.stop(); }, []);

  useEffect(() => {
    if (gameState === "menu" && !isMuted) startBgMusic();
    else stopBgMusic();
    return () => { if (gameState !== "menu") stopBgMusic(); };
  }, [gameState, isMuted]);

  // ─── Ses efektleri ───
  const audio = useCallback((t) => {
    if (isMuted) return;
    try {
      const A = window.AudioContext || window.webkitAudioContext; if (!A) return;
      const c = new A(), o = c.createOscillator(), g = c.createGain();
      o.connect(g); g.connect(c.destination);
      const cfg = { hit: [200, 0.18, 0.07], brick: [440, 0.52, 0.12], lose: [90, 0.28, 0.45], powerup: [580, 0.30, 0.18], levelup: [780, 0.26, 0.4] };
      const [freq, vol, dur] = cfg[t] || [300, 0.1, 0.1];
      o.frequency.setValueAtTime(freq, c.currentTime);
      if (t === "brick") { o.type = "square"; o.frequency.exponentialRampToValueAtTime(freq * 0.45, c.currentTime + dur); }
      g.gain.setValueAtTime(vol, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      o.start(); o.stop(c.currentTime + dur);
    } catch (_) {}
  }, [isMuted]);

  // ─── Leaderboard ───
  const submitScore = useCallback(async (s, l) => {
    if (!address || s <= 0) return;
    if (s > bestRef.current) { setBestScore(s); setIsNewHigh(true); }
    try { await supabase.rpc("upsert_best_score", { p_wallet: address, p_score: s, p_level: l }); } catch (_) {}
  }, [address]);
  const fetchLB = useCallback(async () => {
    setLeaderboardLoading(true);
    try { const { data } = await supabase.from("leaderboard").select("wallet_address, best_score, best_level").order("best_score", { ascending: false }).limit(10); setLeaderboardRows(data || []); } catch (_) { setLeaderboardRows([]); } finally { setLeaderboardLoading(false); }
  }, []);

  // ─── Parçacık efekti ───
  const spawnPtc = (bx, by, bw, bh, color) => {
    for (let i = 0; i < 9; i++) ptcRef.current.push({ x: bx + bw / 2 + (Math.random() - 0.5) * bw * 0.75, y: by + bh / 2 + (Math.random() - 0.5) * bh, vx: (Math.random() - 0.5) * 5.5, vy: (Math.random() - 0.5) * 5.5 - 1.5, life: 1, decay: 0.052 + Math.random() * 0.05, size: 2.5 + Math.random() * 4, color });
  };

  // ─── Tuğla üretimi ───
  const genBricks = (lv = 1) => {
    const rows = 5 + Math.floor((lv - 1) / 5), cols = 7, pad = 5, oTop = 14, oLeft = 7;
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
    bxRef.current = W / 2; byRef.current = H - 52;
    let sp = 1.8 + (lv - 1) * 0.12;
    if (frozenRef.current) sp *= 0.5;
    vxRef.current = Math.random() > 0.5 ? sp : -sp; vyRef.current = -sp; trailRef.current = [];
  };

  const startGame = async () => {
    if (!isConnected) { alert("Please connect your wallet first!"); return; }
    setPaymentError(null);
    if (gameMode === "tournament") {
      setIsPaying(true);
      try { await sendTransactionAsync({ to: GAME_FEE_RECIPIENT, value: GAME_FEE_AMOUNT }); }
      catch { setPaymentError("Payment rejected."); setIsPaying(false); return; }
      setIsPaying(false);
    }
    setScore(0); setLevel(1); setLives(4); setXpGained(0); setCombo(0); setIsNewHigh(false); setIsPaused(false);
    setPuCounts({ WIDE: 0, FIRE: 0, LIFE: 0, FREEZE: 0 }); setActivePowerUp(null);
    pwRef.current = PW; puRef.current = []; frozenRef.current = false; fireRef.current = false;
    trailRef.current = []; ptcRef.current = []; comboRef.current = 0; pausedRef.current = false;
    pxRef.current = (W - PW) / 2; genBricks(1); resetBall(1); setGameState("playing");
  };

  const checkVic = () => {
    if (!bricksRef.current.some(b => b.status === 1)) {
      audio("levelup");
      const gained = Math.floor(comboRef.current * 5 + 50 + levelRef.current * 10);
      setXpGained(gained); setPlayerXp(x => x + gained); setLevel(l => l + 1); setGameState("levelup");
    }
  };

  const doNextLevel = () => {
    genBricks(levelRef.current); resetBall(levelRef.current);
    setActivePowerUp(null); puRef.current = []; frozenRef.current = false; fireRef.current = false;
    ptcRef.current = []; comboRef.current = 0; setCombo(0); setIsPaused(false); pausedRef.current = false;
    setPuCounts({ WIDE: 0, FIRE: 0, LIFE: 0, FREEZE: 0 }); setGameState("playing");
  };

  const openLB = () => { setPrevState(gameState); setGameState("leaderboard"); fetchLB(); };
  const avatarColor = (w) => { const cs = ["#ff2d78","#ff6000","#ffd000","#00c853","#00bcd4","#7c4dff"]; let h = 0; for (let i = 0; i < w.length; i++) h = w.charCodeAt(i) + ((h << 5) - h); return cs[Math.abs(h) % cs.length]; };

  // ─── Menü arka plan animasyonu ───
  useEffect(() => {
    if (gameState !== "menu") return;
    const cv = bgCanvasRef.current; if (!cv) return;
    const ctx = cv.getContext("2d");
    const cw = cv.width, ch = cv.height;
    let frame = 0;
    const triangles = [
      { x: 58, y: 220, size: 42, color: "#00e5ff", angle: 0, speed: 0.008, ox: 58, oy: 220, amp: 14 },
      { x: 318, y: 175, size: 32, color: "#ff00e5", angle: Math.PI / 3, speed: 0.011, ox: 318, oy: 175, amp: 11 },
      { x: 338, y: 325, size: 36, color: "#ff6600", angle: Math.PI, speed: 0.007, ox: 338, oy: 325, amp: 17 },
      { x: 28, y: 385, size: 29, color: "#7700ff", angle: Math.PI * 0.7, speed: 0.009, ox: 28, oy: 385, amp: 9 },
      { x: 360, y: 500, size: 24, color: "#00ff88", angle: Math.PI * 1.4, speed: 0.012, ox: 360, oy: 500, amp: 13 },
    ];
    const stars = Array.from({ length: 55 }, (_, i) => ({ x: (i * 89 + 20) % cw, y: (i * 67 + 10) % ch, r: i % 5 === 0 ? 1.4 : 0.75, a: 0.05 + (i % 5) * 0.03 }));
    let aid;
    const drawTri = (tx, ty, size, angle, color) => {
      ctx.save(); ctx.translate(tx, ty); ctx.rotate(angle);
      ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(size * 0.86, size * 0.5); ctx.lineTo(-size * 0.86, size * 0.5); ctx.closePath();
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.55; ctx.shadowColor = color; ctx.shadowBlur = 8; ctx.stroke();
      ctx.restore();
    };
    const loop = () => {
      frame++;
      ctx.clearRect(0, 0, cw, ch);
      const bg = ctx.createLinearGradient(0, 0, cw, ch);
      bg.addColorStop(0, "#060418"); bg.addColorStop(0.5, "#0c0828"); bg.addColorStop(1, "#060418");
      ctx.fillStyle = bg; ctx.globalAlpha = 1; ctx.fillRect(0, 0, cw, ch);
      stars.forEach(s => { ctx.fillStyle = "#fff"; ctx.globalAlpha = s.a + Math.sin(frame * 0.04 + s.x) * 0.03; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill(); });
      triangles.forEach(t => { t.angle += t.speed; t.x = t.ox + Math.sin(t.angle * 0.7) * t.amp; t.y = t.oy + Math.cos(t.angle * 0.5) * t.amp; drawTri(t.x, t.y, t.size, t.angle, t.color); });
      ctx.globalAlpha = 1;
      aid = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(aid);
  }, [gameState]);

  // ─── Oyun döngüsü ───
  useEffect(() => {
    let aid;
    const drawBrick = (ctx, b) => {
      if (!b.status) return;
      const { x, y, width: w, height: h, rc } = b;
      const r = 6;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 8; ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 4;
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, rc.top); g.addColorStop(0.5, rc.mid); g.addColorStop(1, rc.bot);
      ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      const sg = ctx.createLinearGradient(x, y, x, y + h * 0.55);
      sg.addColorStop(0, rc.shine); sg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = sg; ctx.beginPath(); ctx.roundRect(x + 2, y + 2, w - 4, h * 0.5, [r - 1, r - 1, 2, 2]); ctx.fill();
      if (b.pu) {
        const icons = { LIFE: "♥", FREEZE: "❄", FIRE: "🔥", WIDE: "↔" };
        ctx.shadowBlur = 0; ctx.font = `bold ${Math.floor(h * 0.58)}px sans-serif`;
        ctx.fillStyle = "rgba(255,255,255,0.92)"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(icons[b.pu] || "?", x + w / 2, y + h / 2 + 1);
      }
      ctx.restore();
    };

    const update = () => {
      if (gsRef.current !== "playing" || pausedRef.current) return;
      bxRef.current += vxRef.current; byRef.current += vyRef.current;
      trailRef.current.push({ x: bxRef.current, y: byRef.current }); if (trailRef.current.length > 13) trailRef.current.shift();
      if (bxRef.current + BR > W || bxRef.current - BR < 0) { vxRef.current = -vxRef.current; audio("hit"); }
      if (byRef.current - BR < 0) { vyRef.current = -vyRef.current; audio("hit"); }

      // Paddle çarpışması — pozisyona göre yön ver
      if (vyRef.current > 0 && byRef.current + BR >= H - PH - 5 && bxRef.current >= pxRef.current && bxRef.current <= pxRef.current + pwRef.current) {
        const hitFactor = ((bxRef.current - pxRef.current) / pwRef.current - 0.5) * 2;
        const speed = Math.sqrt(vxRef.current * vxRef.current + vyRef.current * vyRef.current);
        const maxAngle = 65 * (Math.PI / 180);
        const angle = hitFactor * maxAngle;
        vxRef.current = speed * Math.sin(angle);
        vyRef.current = -Math.abs(speed * Math.cos(angle));
        if (Math.abs(vxRef.current) < 0.4) vxRef.current = hitFactor >= 0 ? 0.4 : -0.4;
        audio("hit"); comboRef.current = 0; setCombo(0);
      }

      if (byRef.current > H) {
        audio("lose"); comboRef.current = 0; setCombo(0);
        const nl = livesRef.current - 1; setLives(nl);
        if (nl <= 0) { setGameState("gameover"); submitScore(scoreRef.current, levelRef.current); } else resetBall();
      }
      ptcRef.current = ptcRef.current.filter(p => p.life > 0);
      ptcRef.current.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.2; p.life -= p.decay; });
      bricksRef.current.forEach(b => {
        if (!b.status) return;
        if (bxRef.current >= b.x && bxRef.current <= b.x + b.width && byRef.current >= b.y && byRef.current <= b.y + b.height) {
          b.status = 0; comboRef.current++;
          const pts = 10 + (comboRef.current > 1 ? comboRef.current * 5 : 0);
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
      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, "#06041a"); bg.addColorStop(0.5, "#0a0828"); bg.addColorStop(1, "#06041a");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      // Yıldızlar
      ctx.save(); for (let i = 0; i < 45; i++) { ctx.fillStyle = `rgba(255,255,255,${0.04 + (i % 5) * 0.025})`; ctx.beginPath(); ctx.arc((i * 97 + 30) % W, (i * 71 + 15) % H, i % 5 === 0 ? 1.3 : 0.7, 0, Math.PI * 2); ctx.fill(); } ctx.restore();
      // Neon çerçeve
      ctx.save(); ctx.strokeStyle = "rgba(120,60,255,0.38)"; ctx.lineWidth = 2; ctx.shadowColor = "#8040ff"; ctx.shadowBlur = 14; ctx.strokeRect(2, 2, W - 4, H - 4); ctx.restore();
      // Tuğlalar
      bricksRef.current.forEach(b => drawBrick(ctx, b));
      // Parçacıklar
      ptcRef.current.forEach(p => { ctx.save(); ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 8; ctx.beginPath(); ctx.roundRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size, 2); ctx.fill(); ctx.restore(); });
      // Düşen power-up'lar
      const pu_c = { WIDE: "#00d4ff", LIFE: "#ff3070", FREEZE: "#60c0ff", FIRE: "#ff8800" };
      const pu_l = { WIDE: "E", LIFE: "♥", FREEZE: "❄", FIRE: "F" };
      puRef.current.forEach(p => { const pc = pu_c[p.type] || "#fff"; ctx.save(); ctx.shadowColor = pc; ctx.shadowBlur = 18; ctx.strokeStyle = pc; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, 12, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = pc + "38"; ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = "#fff"; ctx.font = "bold 9px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(pu_l[p.type] || "?", p.x, p.y + 0.5); ctx.restore(); });
      // Pedal
      const py = H - PH - 5;
      ctx.save(); ctx.shadowColor = "#6060ff"; ctx.shadowBlur = 35;
      const pg = ctx.createLinearGradient(pxRef.current, py, pxRef.current, py + PH);
      pg.addColorStop(0, "#a0b8ff"); pg.addColorStop(0.35, "#5060ff"); pg.addColorStop(1, "#1020a0");
      ctx.fillStyle = pg; ctx.beginPath(); ctx.roundRect(pxRef.current, py, pwRef.current, PH, PH / 2); ctx.fill();
      ctx.shadowBlur = 0;
      const padShine = ctx.createLinearGradient(pxRef.current, py, pxRef.current + pwRef.current, py);
      padShine.addColorStop(0, "rgba(255,255,255,0)"); padShine.addColorStop(0.3, "rgba(255,255,255,0.65)"); padShine.addColorStop(0.7, "rgba(255,255,255,0.65)"); padShine.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = padShine; ctx.beginPath(); ctx.roundRect(pxRef.current + 4, py + 2.5, pwRef.current - 8, 2.5, 2); ctx.fill(); ctx.restore();
      // Top
      let bc = "#ff3070", bg2 = "#ff1050"; if (fireRef.current) { bc = "#ff9000"; bg2 = "#ff6000"; } else if (frozenRef.current) { bc = "#70d0ff"; bg2 = "#40b0ff"; }
      trailRef.current.forEach((t, i) => { ctx.save(); ctx.globalAlpha = (i / trailRef.current.length) * 0.52; ctx.fillStyle = bc; ctx.beginPath(); ctx.arc(t.x, t.y, BR * (0.28 + i / trailRef.current.length * 0.72), 0, Math.PI * 2); ctx.fill(); ctx.restore(); });
      ctx.save(); ctx.shadowColor = bg2; ctx.shadowBlur = 34;
      const bgr = ctx.createRadialGradient(bxRef.current - 2.5, byRef.current - 2.5, 1, bxRef.current, byRef.current, BR);
      bgr.addColorStop(0, "#fff"); bgr.addColorStop(0.35, bc); bgr.addColorStop(1, bg2);
      ctx.fillStyle = bgr; ctx.beginPath(); ctx.arc(bxRef.current, byRef.current, BR, 0, Math.PI * 2); ctx.fill();
      if (fireRef.current || frozenRef.current) { ctx.strokeStyle = fireRef.current ? "rgba(255,160,0,0.7)" : "rgba(96,210,255,0.7)"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(bxRef.current, byRef.current, BR + 4, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
      // Duraklama overlay
      if (pausedRef.current) {
        ctx.save(); ctx.fillStyle = "rgba(0,0,0,0.64)"; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#fff"; ctx.font = "bold 30px Arial Black, Arial, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.shadowColor = "#8040ff"; ctx.shadowBlur = 22; ctx.fillText("⏸  PAUSED", W / 2, H / 2 - 16);
        ctx.font = "14px Arial, sans-serif"; ctx.shadowBlur = 0; ctx.fillStyle = "rgba(255,255,255,0.58)";
        ctx.fillText("Tap ▶ to continue", W / 2, H / 2 + 20); ctx.restore();
      }
    };

    const loop = () => { update(); render(); aid = requestAnimationFrame(loop); };
    if (gameState === "playing" || gameState === "gameover") aid = requestAnimationFrame(loop);
    else { const cv = canvasRef.current; if (cv) { const ctx = cv.getContext("2d"); if (ctx) ctx.clearRect(0, 0, W, H); } }
    return () => cancelAnimationFrame(aid);
  }, [gameState, audio, level, isPaused]);

  const onMove = (e) => { if (gsRef.current !== "playing" || !canvasRef.current || pausedRef.current) return; const r = canvasRef.current.getBoundingClientRect(); const cx = (e.clientX - r.left) * (W / r.width); pxRef.current = Math.max(0, Math.min(W - pwRef.current, cx - pwRef.current / 2)); };
  const onTouch = (e) => { if (gsRef.current !== "playing" || !canvasRef.current || !e.touches.length || pausedRef.current) return; if (e.cancelable) e.preventDefault(); const r = canvasRef.current.getBoundingClientRect(); const cx = (e.touches[0].clientX - r.left) * (W / r.width); pxRef.current = Math.max(0, Math.min(W - pwRef.current, cx - pwRef.current / 2)); };

  // ─── Paylaşım ─── (Farcaster + X, her iki ortamda çalışır)
  const wt = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error("t")), ms))]);
  const refCode = address ? address.slice(2, 8).toUpperCase() : "GUEST";
  const shareTxt = () => `Base Brick Breaker'da ${level}. seviyeye ulaşıp ${score} puanla çıtayı buraya koydum.\nAranızda bu skoru geçebilecek bir "Brick Master" var mı? Hodri meydan! 🔥`;
  const refLink = () => { if (typeof window === "undefined") return ""; const u = new URL(window.location.href); u.searchParams.set("ref", refCode); return u.toString(); };
  const fallback = async () => {
    try {
      if (navigator.share) await navigator.share({ text: shareTxt(), url: refLink() });
      else { await navigator.clipboard.writeText(`${shareTxt()} ${refLink()}`); alert("Copied to clipboard!"); }
    } catch (_) {}
  };
  const shareFarcaster = async () => {
    setShareMenuOpen(false);
    try {
      const mod = await import("@farcaster/miniapp-sdk");
      const sdk = mod.sdk || mod.default;
      if (!sdk) { await fallback(); return; }
      const inApp = await wt(sdk.isInMiniApp(), 1200).catch(() => false);
      if (!inApp) { await fallback(); return; }
      await wt(sdk.actions.composeCast({ text: shareTxt(), embeds: [refLink()] }), 3000);
    } catch (_) { await fallback(); }
  };
  const shareX = async () => {
    setShareMenuOpen(false);
    const xu = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareTxt())}&url=${encodeURIComponent(refLink())}`;
    try {
      const mod = await import("@farcaster/miniapp-sdk");
      const sdk = mod.sdk || mod.default;
      if (!sdk) { window.open(xu, "_blank"); return; }
      const inApp = await wt(sdk.isInMiniApp(), 1200).catch(() => false);
      if (!inApp) { window.open(xu, "_blank"); return; }
      await wt(sdk.actions.openUrl(xu), 2000);
    } catch (_) { window.open(xu, "_blank"); }
  };

  if (!isSdkLoaded) return <div style={{ background: "#06041a", color: "#fff", padding: 40, textAlign: "center", borderRadius: 16, minHeight: 220, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>Loading...</div>;

  const ShareMenu = () => shareMenuOpen ? (
    <div style={{ position: "absolute", bottom: "110%", right: 0, background: "#14103a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, overflow: "hidden", zIndex: 40, minWidth: 148 }}>
      <button onClick={shareFarcaster} style={{ width: "100%", padding: "11px 14px", background: "none", border: "none", color: "#c080ff", fontWeight: 700, fontSize: 11, cursor: "pointer", textAlign: "left" }}>🟣 Farcaster</button>
      <button onClick={shareX} style={{ width: "100%", padding: "11px 14px", background: "none", border: "none", color: "#b0b0c8", fontWeight: 700, fontSize: 11, cursor: "pointer", textAlign: "left", borderTop: "1px solid rgba(255,255,255,0.07)" }}>✖️ X (Twitter)</button>
    </div>
  ) : null;

  return (
    <div style={{ background: "linear-gradient(160deg, #060418 0%, #0c0828 50%, #060418 100%)", borderRadius: 20, overflow: "hidden", maxWidth: 440, margin: "0 auto", fontFamily: "'Arial Black', Arial, sans-serif" }}>

      {/* ═══════════════ MENÜ ═══════════════ */}
      {gameState === "menu" && (
        <div style={{ position: "relative", minHeight: 640, overflow: "hidden" }}>
          <canvas ref={bgCanvasRef} width={390} height={640} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />
          <div style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column", alignItems: "center", padding: "18px 20px 22px", gap: 0 }}>

            {/* Üst bar */}
            <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <button style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", fontSize: 17, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>☰</button>
              <button onClick={() => isConnected ? disconnect() : (connectors[0] && connect({ connector: connectors[0] }))} style={{ padding: "7px 14px", borderRadius: 20, fontWeight: 700, fontSize: 11, cursor: "pointer", border: "1px solid rgba(0,220,200,0.4)", background: "rgba(0,220,200,0.12)", color: isConnected ? "#00dcc8" : "#80ffee" }}>
                {isConnected ? `${address.slice(0, 4)}...${address.slice(-4)}` : "Connect Wallet"}
              </button>
            </div>

            {/* Başlık */}
            <div style={{ textAlign: "center", marginBottom: 4 }}>
              <div style={{ color: "#dcdcff", fontWeight: 900, fontSize: 22, letterSpacing: 2.5, textShadow: "0 0 20px rgba(190,170,255,0.6)" }}>BASE BRICK</div>
              <div style={{ fontWeight: 900, fontSize: 48, letterSpacing: 3, background: "linear-gradient(135deg, #ff90ff 0%, #cc40ff 40%, #7040ff 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", lineHeight: 0.95, textShadow: "none" }}>BREAKER</div>
              <div style={{ color: "#8080b8", fontSize: 10, fontWeight: 700, letterSpacing: 3.5, marginTop: 6 }}>CLASSIC ARCADE EDITION</div>
            </div>

            {/* Top + Pedal görsel */}
            <div style={{ position: "relative", width: 280, height: 195, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12, marginTop: 4 }}>
              <div style={{ position: "absolute", bottom: 36, left: "50%", transform: "translateX(-50%)", width: 190, height: 34, background: "radial-gradient(ellipse, rgba(120,80,255,0.55) 0%, transparent 70%)", filter: "blur(9px)" }} />
              <div style={{ position: "absolute", bottom: 56, left: "50%", transform: "translateX(-50%)", width: 2.5, height: 112, background: "linear-gradient(180deg, rgba(160,110,255,0.9) 0%, transparent 100%)", boxShadow: "0 0 14px #9055ff" }} />
              <div style={{ position: "absolute", bottom: 56, left: "50%", transform: "translateX(-62%) rotate(-17deg)", width: 1.5, height: 88, background: "linear-gradient(180deg, rgba(100,210,255,0.55) 0%, transparent 100%)" }} />
              <div style={{ position: "absolute", bottom: 56, left: "50%", transform: "translateX(-38%) rotate(17deg)", width: 1.5, height: 88, background: "linear-gradient(180deg, rgba(100,210,255,0.55) 0%, transparent 100%)" }} />
              <div style={{ position: "absolute", bottom: 116, left: "50%", transform: "translateX(-50%)", width: 56, height: 56, borderRadius: "50%", background: "radial-gradient(circle at 32% 28%, #ffffff, #d060ff 38%, #8030ff)", boxShadow: "0 0 32px #a050ff, 0 0 64px rgba(160,80,255,0.52), inset 0 -4px 10px rgba(0,0,0,0.3)" }} />
              <div style={{ position: "absolute", bottom: 36, left: "50%", transform: "translateX(-50%)", width: 138, height: 19, borderRadius: 10, background: "linear-gradient(90deg, #a0b8ff, #6080ff, #a0b8ff)", boxShadow: "0 0 28px #6080ff, 0 0 55px rgba(96,128,255,0.42), 0 4px 14px rgba(0,0,0,0.42)" }}>
                <div style={{ position: "absolute", top: 3.5, left: "14%", right: "14%", height: 3, borderRadius: 2, background: "rgba(255,255,255,0.65)" }} />
              </div>
            </div>

            {/* Mod toggle */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {["tournament", "practice"].map(m => (
                <button key={m} onClick={() => setGameMode(m)} style={{ padding: "6px 14px", borderRadius: 8, fontSize: 10, fontWeight: 700, cursor: "pointer", border: `1px solid ${gameMode === m ? "rgba(130,90,255,0.65)" : "rgba(255,255,255,0.12)"}`, background: gameMode === m ? "rgba(130,90,255,0.25)" : "rgba(255,255,255,0.05)", color: gameMode === m ? "#c8a8ff" : "#606090" }}>
                  {m === "tournament" ? "🏆 Tournament" : "🕹️ Practice"}
                </button>
              ))}
            </div>
            {gameMode === "tournament" && <div style={{ color: "#ff8848", fontSize: 9, fontWeight: 700, marginBottom: 10 }}>0.00001 ETH per game on Base</div>}

            {/* PLAY NOW */}
            <button onClick={startGame} disabled={isPaying} style={{ width: "100%", padding: "18px", borderRadius: 16, fontWeight: 900, fontSize: 19, letterSpacing: 2, cursor: isPaying ? "not-allowed" : "pointer", border: "none", background: "linear-gradient(135deg, #ff2060 0%, #cc1890 42%, #8020c0 100%)", color: "#fff", boxShadow: "0 0 32px rgba(200,40,150,0.58), 0 5px 22px rgba(0,0,0,0.42)", opacity: isPaying ? 0.65 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 11, marginBottom: 13 }}>
              <span style={{ fontSize: 21 }}>▶</span>{isPaying ? "CONFIRMING..." : "PLAY NOW"}
            </button>
            {paymentError && <div style={{ color: "#ff5060", fontSize: 10, textAlign: "center", marginTop: -8, marginBottom: 8 }}>{paymentError}</div>}

            {/* Alt 2x2 butonlar */}
            <div style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <button onClick={() => {}} style={{ padding: "14px 8px", borderRadius: 14, fontWeight: 700, fontSize: 12, cursor: "pointer", border: "1px solid rgba(200,150,40,0.42)", background: "rgba(180,120,20,0.18)", color: "#ffcc44", display: "flex", alignItems: "center", justifyContent: "center", gap: 9 }}>
                🏆 TOURNAMENT
              </button>
              <button onClick={openLB} style={{ padding: "14px 8px", borderRadius: 14, fontWeight: 700, fontSize: 12, cursor: "pointer", border: "1px solid rgba(60,120,255,0.42)", background: "rgba(40,80,220,0.18)", color: "#6090ff", display: "flex", alignItems: "center", justifyContent: "center", gap: 9 }}>
                📊 LEADERBOARD
              </button>
            </div>
            <div style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button style={{ padding: "14px 8px", borderRadius: 14, fontWeight: 700, fontSize: 12, cursor: "not-allowed", border: "1px solid rgba(255,255,255,0.09)", background: "rgba(255,255,255,0.04)", color: "#454565", display: "flex", alignItems: "center", justifyContent: "center", gap: 9 }}>
                🛒 SHOP
              </button>
              <button onClick={() => setIsMuted(m => !m)} style={{ padding: "14px 8px", borderRadius: 14, fontWeight: 700, fontSize: 12, cursor: "pointer", border: "1px solid rgba(255,255,255,0.13)", background: "rgba(255,255,255,0.06)", color: "#8090c0", display: "flex", alignItems: "center", justifyContent: "center", gap: 9 }}>
                {isMuted ? "🔇" : "⚙️"} SETTINGS
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ OYUN EKRANI ═══════════════ */}
      {(gameState === "playing" || gameState === "gameover") && (
        <div style={{ display: "flex", flexDirection: "column" }}>

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px 8px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <div>
              <div style={{ color: "#c0c0ff", fontWeight: 900, fontSize: 13, letterSpacing: 1.5 }}>BASE BRICK</div>
              <div style={{ fontWeight: 900, fontSize: 17, background: "linear-gradient(135deg, #ff88ff, #8040ff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: 1 }}>BREAKER</div>
              <div style={{ color: "#484068", fontSize: 8, fontWeight: 700, letterSpacing: 2 }}>CLASSIC ARCADE EDITION</div>
            </div>
            <button onClick={() => isConnected ? disconnect() : (connectors[0] && connect({ connector: connectors[0] }))} style={{ padding: "5px 10px", borderRadius: 20, fontWeight: 700, fontSize: 11, cursor: "pointer", border: "1px solid rgba(0,220,200,0.35)", background: "rgba(0,220,200,0.1)", color: "#00dcc8" }}>
              {isConnected ? `${address.slice(0, 4)}...${address.slice(-4)}` : "Connect"}
            </button>
          </div>

          {/* Skor barı */}
          <div style={{ display: "flex", justifyContent: "space-around", alignItems: "center", padding: "8px 14px", background: "rgba(0,0,0,0.42)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            {[{ l: "SCORE", v: score.toLocaleString(), c: "#00e5ff" }, { l: "LIVES", v: "❤️".repeat(Math.max(0, lives)), c: "#ff3070" }, { l: "LEVEL", v: level, c: "#b060ff" }].map((s, i) => (
              <React.Fragment key={s.l}>
                {i > 0 && <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.08)" }} />}
                <div style={{ textAlign: "center" }}>
                  <div style={{ color: "#484068", fontSize: 9, fontWeight: 700, letterSpacing: 1.5 }}>{s.l}</div>
                  <div style={{ color: s.c, fontWeight: 900, fontSize: 16 }}>{s.v}</div>
                </div>
              </React.Fragment>
            ))}
          </div>

          {/* Canvas alanı - neon çerçeveli */}
          <div style={{ position: "relative", margin: "0 6px", borderRadius: 14, overflow: "hidden", border: "2px solid rgba(140,80,255,0.55)", boxShadow: "0 0 22px rgba(140,80,255,0.35), inset 0 0 22px rgba(0,0,0,0.45)" }}>
            <canvas ref={canvasRef} width={W} height={H} onPointerMove={onMove} onTouchMove={onTouch} onTouchStart={onTouch} style={{ width: "100%", display: "block", touchAction: "none", cursor: "crosshair" }} />

            {/* Combo */}
            {showCombo && combo > 1 && <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", color: "#ffd000", fontWeight: 900, fontSize: 16, textShadow: "0 0 14px #ffd000", pointerEvents: "none", whiteSpace: "nowrap" }}>x{combo} COMBO! 🔥</div>}
            {/* Aktif power-up rozeti */}
            {activePowerUp && <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,200,255,0.17)", border: "1px solid rgba(0,200,255,0.42)", borderRadius: 8, padding: "3px 9px", color: "#00e5ff", fontSize: 9, fontWeight: 700 }}>{activePowerUp} ACTIVE</div>}

            {/* Duraklat butonu */}
            <button onClick={() => setIsPaused(p => !p)} style={{ position: "absolute", bottom: 10, left: 10, width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg, rgba(100,60,200,0.85), rgba(60,30,140,0.85))", border: "2px solid rgba(160,120,255,0.65)", color: "#fff", cursor: "pointer", fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 18px rgba(120,80,255,0.55)" }}>
              {isPaused ? "▶" : "⏸"}
            </button>
            {/* Leaderboard butonu */}
            <button onClick={openLB} style={{ position: "absolute", bottom: 10, right: 10, width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg, rgba(160,100,0,0.85), rgba(100,60,0,0.85))", border: "2px solid rgba(255,210,0,0.55)", color: "#ffd000", cursor: "pointer", fontSize: 19, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 18px rgba(255,180,0,0.45)" }}>
              ⚡
            </button>

            {/* Game Over overlay */}
            {gameState === "gameover" && (
              <div style={{ position: "absolute", inset: 0, background: "rgba(4,2,20,0.95)", backdropFilter: "blur(8px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, padding: "24px 20px" }}>
                <div style={{ fontWeight: 900, fontSize: 52, letterSpacing: 4, background: "linear-gradient(135deg, #ff4060, #ff8800)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", textShadow: "none" }}>GAME OVER</div>
                {isNewHigh && <div style={{ color: "#ffd000", fontWeight: 800, fontSize: 17, letterSpacing: 1.5 }}>🌟 NEW HIGH SCORE!</div>}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", background: "rgba(255,255,255,0.07)", borderRadius: 22, padding: "20px 16px", border: "1px solid rgba(255,255,255,0.12)", width: "100%", gap: 0 }}>
                  {[{ l: "SCORE", v: score.toLocaleString(), c: "#fff" }, { l: "BEST SCORE", v: Math.max(score, bestScore).toLocaleString(), c: "#ffd000" }, { l: "LEVEL", v: level, c: "#b060ff" }].map((s, i) => (
                    <div key={s.l} style={{ textAlign: "center", padding: "4px 0", borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.1)" : "none" }}>
                      <div style={{ color: "#484068", fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>{s.l}</div>
                      <div style={{ color: s.c, fontWeight: 900, fontSize: 26 }}>{s.v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 22, marginTop: 6, alignItems: "center" }}>
                  <button onClick={() => setGameState("menu")} style={{ width: 70, height: 70, borderRadius: "50%", background: "rgba(255,255,255,0.09)", border: "1.5px solid rgba(255,255,255,0.22)", color: "#fff", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, gap: 2 }}>
                    <span style={{ fontSize: 26 }}>🏠</span>HOME
                  </button>
                  <button onClick={startGame} disabled={isPaying} style={{ width: 98, height: 98, borderRadius: "50%", background: "radial-gradient(circle at 38% 34%, #e880ff, #9030ff 52%, #5810cc)", border: "3px solid rgba(240,180,255,0.72)", color: "#fff", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, gap: 3, boxShadow: "0 0 44px rgba(200,80,255,0.95), 0 0 88px rgba(160,40,255,0.55), 0 0 140px rgba(130,20,255,0.28), inset 0 2px 6px rgba(255,255,255,0.4)", opacity: isPaying ? 0.65 : 1, animation: "none" }}>
                    <span style={{ fontSize: 32 }}>↺</span>RETRY
                  </button>
                  <div style={{ position: "relative" }}>
                    <button onClick={() => setShareMenuOpen(o => !o)} style={{ width: 70, height: 70, borderRadius: "50%", background: "rgba(255,255,255,0.09)", border: "1.5px solid rgba(255,255,255,0.22)", color: "#fff", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, gap: 2 }}>
                      <span style={{ fontSize: 26 }}>📤</span>SHARE
                    </button>
                    <ShareMenu />
                  </div>
                </div>
                {paymentError && <div style={{ color: "#ff5060", fontSize: 10 }}>{paymentError}</div>}
              </div>
            )}
          </div>

          {/* Power-ups paneli - büyük kart stili */}
          <div style={{ background: "linear-gradient(180deg, #0e0a2a 0%, #0b0820 100%)", borderTop: "2px solid rgba(120,80,255,0.45)", padding: "10px 14px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ color: "#6050a0", fontSize: 9, fontWeight: 700, letterSpacing: 2.5 }}>POWER-UPS</div>
              <button onClick={() => setIsMuted(m => !m)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", opacity: 0.6 }}>{isMuted ? "🔇" : "🎵"}</button>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              {[
                { k: "WIDE",   ic: "↔",  lb: "EXPAND",     c: "#00d4ff", bg: "rgba(0,212,255,0.18)",   brd: "rgba(0,212,255,0.6)",  glow: "#00d4ff" },
                { k: "FIRE",   ic: "🔥", lb: "FIRE",       c: "#ff9200", bg: "rgba(255,146,0,0.18)",   brd: "rgba(255,146,0,0.6)",  glow: "#ff9200" },
                { k: "LIFE",   ic: "❤️", lb: "EXTRA LIFE", c: "#ff3070", bg: "rgba(255,48,112,0.18)",  brd: "rgba(255,48,112,0.6)", glow: "#ff3070" },
                { k: "FREEZE", ic: "❄️", lb: "SLOW BALL",  c: "#60c8ff", bg: "rgba(96,200,255,0.18)",  brd: "rgba(96,200,255,0.6)", glow: "#60c8ff" },
              ].map(pu => {
                const active = puCounts[pu.k] > 0;
                return (
                  <div key={pu.k} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: 1 }}>
                    <div style={{ width: "100%", aspectRatio: "1", borderRadius: 14, background: active ? pu.bg : "rgba(255,255,255,0.04)", border: `2px solid ${active ? pu.brd : "rgba(255,255,255,0.08)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, opacity: active ? 1 : 0.28, boxShadow: active ? `0 0 18px ${pu.glow}60, 0 0 36px ${pu.glow}28` : "none", transition: "all 0.3s", minHeight: 56 }}>
                      {pu.k === "WIDE" ? <span style={{ fontSize: 22, color: pu.c, fontWeight: 900 }}>↔</span> : pu.ic}
                    </div>
                    <div style={{ color: active ? pu.c : "#382860", fontSize: 14, fontWeight: 900, lineHeight: 1 }}>{puCounts[pu.k]}</div>
                    <div style={{ color: active ? pu.c + "aa" : "#302050", fontSize: 7, fontWeight: 700, letterSpacing: 0.5, whiteSpace: "nowrap" }}>{pu.lb}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ LEVEL UP ═══════════════ */}
      {gameState === "levelup" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 24px", gap: 18, minHeight: 600, background: "linear-gradient(180deg, #060020 0%, #18006a 50%, #060020 100%)" }}>
          <div style={{ fontWeight: 900, fontSize: 42, letterSpacing: 3, color: "#e060ff", textShadow: "0 0 42px #c040ff, 0 0 84px rgba(200,64,255,0.42)" }}>LEVEL UP!</div>
          <div style={{ color: "#7080a8", fontWeight: 700, fontSize: 13, letterSpacing: 2.5 }}>YOU REACHED</div>
          <div style={{ fontWeight: 900, fontSize: 58, color: "#00d4ff", textShadow: "0 0 38px #00b0ff" }}>LEVEL {level}</div>
          <div style={{ width: 80, height: 80, borderRadius: "50%", background: "radial-gradient(circle at 32% 28%, #fff, #c060ff)", boxShadow: "0 0 58px #8040ff, 0 0 116px rgba(128,64,255,0.46)", margin: "8px 0" }} />
          <div style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {[{ l: "SCORE", v: score.toLocaleString(), c: "#fff" }, { l: "XP GAINED", v: `+${xpGained} XP`, c: "#a070ff" }].map(s => (
              <div key={s.l} style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.11)", borderRadius: 18, padding: 18, textAlign: "center" }}>
                <div style={{ color: "#484068", fontSize: 9, fontWeight: 700, letterSpacing: 1.5 }}>{s.l}</div>
                <div style={{ color: s.c, fontWeight: 900, fontSize: 30, marginTop: 4 }}>{s.v}</div>
              </div>
            ))}
          </div>
          <button onClick={doNextLevel} style={{ width: "100%", padding: 19, borderRadius: 18, fontWeight: 900, fontSize: 18, letterSpacing: 2, cursor: "pointer", border: "none", background: "linear-gradient(135deg, #8040ff, #5020c0)", color: "#fff", boxShadow: "0 0 38px rgba(120,64,255,0.58)" }}>▶  NEXT LEVEL</button>
          <button onClick={openLB} style={{ width: "100%", padding: 14, borderRadius: 16, fontWeight: 700, fontSize: 12, letterSpacing: 1.5, cursor: "pointer", border: "1px solid rgba(255,200,0,0.3)", background: "rgba(255,200,0,0.09)", color: "#ffd000" }}>🏆 LEADERBOARD</button>
        </div>
      )}

      {/* ═══════════════ LEADERBOARD ═══════════════ */}
      {gameState === "leaderboard" && (
        <div style={{ minHeight: 600, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <button onClick={() => setGameState(prevState || "menu")} style={{ background: "none", border: "none", color: "#7060a0", cursor: "pointer", fontSize: 23 }}>←</button>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 23 }}>🏆</span><span style={{ color: "#fff", fontWeight: 900, fontSize: 17, letterSpacing: 1.5 }}>LEADERBOARD</span></div>
            {isConnected ? <span style={{ color: "#e060ff", fontSize: 10, fontWeight: 700 }}>{address.slice(0, 4)}...{address.slice(-4)}</span> : <span />}
          </div>
          <div style={{ display: "flex", gap: 6, padding: "10px 16px 8px" }}>
            {["GLOBAL", "FRIENDS", "TOURNAMENT"].map((t, i) => (
              <button key={t} style={{ padding: "7px 12px", borderRadius: 9, fontWeight: 700, fontSize: 10, cursor: "pointer", border: "none", background: i === 0 ? "#7040ff" : "rgba(255,255,255,0.05)", color: i === 0 ? "#fff" : "#504080" }}>{t}</button>
            ))}
          </div>
          <div style={{ padding: "4px 16px", display: "flex", flexDirection: "column", gap: 7, flex: 1, overflowY: "auto", maxHeight: 370 }}>
            {leaderboardLoading
              ? <div style={{ color: "#504080", textAlign: "center", padding: 30 }}>Loading...</div>
              : leaderboardRows.length === 0
                ? <div style={{ color: "#504080", textAlign: "center", padding: 30, fontSize: 12 }}>No scores yet. Be the first!</div>
                : leaderboardRows.map((row, idx) => {
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
                  })}
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
          <div style={{ textAlign: "center", padding: "6px 0 10px", color: "#403060", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>⏱ SEASON ENDS IN: 6D 14H 32M</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "0 16px 16px" }}>
            <button onClick={startGame} disabled={isPaying} style={{ padding: 14, borderRadius: 16, fontWeight: 900, fontSize: 13, letterSpacing: 1, cursor: "pointer", border: "none", background: "linear-gradient(135deg, #e060ff, #a040ff)", color: "#fff", boxShadow: "0 0 22px rgba(200,64,255,0.42)", opacity: isPaying ? 0.6 : 1 }}>
              {isPaying ? "..." : "▶ PLAY AGAIN"}
            </button>
            <div style={{ position: "relative" }}>
              <button onClick={() => setShareMenuOpen(o => !o)} style={{ width: "100%", padding: 14, borderRadius: 16, fontWeight: 700, fontSize: 12, cursor: "pointer", border: "1px solid rgba(100,80,255,0.3)", background: "rgba(100,80,255,0.1)", color: "#a090ff" }}>Share 📤</button>
              <ShareMenu />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
