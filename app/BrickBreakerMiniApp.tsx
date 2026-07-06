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

const W = 390, H = 420, PW = 80, PH = 14, BR = 8;

const ROW_COLORS = [
  { top: "#ff80b0", mid: "#ff2d78", bot: "#990040", shine: "rgba(255,210,230,0.7)" },
  { top: "#ffb070", mid: "#ff6000", bot: "#993600", shine: "rgba(255,220,170,0.7)" },
  { top: "#ffee80", mid: "#ffcc00", bot: "#997800", shine: "rgba(255,248,170,0.7)" },
  { top: "#90f070", mid: "#44cc00", bot: "#228800", shine: "rgba(190,255,160,0.7)" },
  { top: "#70e8f8", mid: "#00c0d8", bot: "#007888", shine: "rgba(160,245,255,0.7)" },
  { top: "#c890ff", mid: "#8040ff", bot: "#4000cc", shine: "rgba(215,185,255,0.7)" },
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

  const scoreRef = useRef(0);
  const levelRef = useRef(1);
  const livesRef = useRef(4);
  const gsRef = useRef("menu");
  const pausedRef = useRef(false);
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

  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { levelRef.current = level; }, [level]);
  useEffect(() => { livesRef.current = lives; }, [lives]);
  useEffect(() => { gsRef.current = gameState; }, [gameState]);
  useEffect(() => { pausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { bestRef.current = bestScore; }, [bestScore]);
  useEffect(() => { const req = playerLv * 100; if (playerXp >= req) { setPlayerLv(l => l + 1); setPlayerXp(x => x - req); } }, [playerXp, playerLv]);
  useEffect(() => { const init = async () => { try { const { sdk } = await import("@farcaster/miniapp-sdk"); if (sdk) { await sdk.actions.init(); setIsSdkLoaded(true); await sdk.actions.ready(); } } catch (e) { setIsSdkLoaded(true); } }; init(); }, []);

  // arka plan müziği (menüde çalıyor)
  const startBgMusic = useCallback(() => {
    if (isMuted) return;
    try {
      if (bgMusicRef.current) return;
      const A = window.AudioContext || window.webkitAudioContext;
      if (!A) return;
      const ctx = new A();
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.04, ctx.currentTime);
      master.connect(ctx.destination);
      // Ambient pad - birkaç frekans ile zengin ses
      const freqs = [110, 138.6, 165, 220];
      const oscs = freqs.map((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = i % 2 === 0 ? "sine" : "triangle";
        o.frequency.setValueAtTime(f, ctx.currentTime);
        g.gain.setValueAtTime(0.015 + i * 0.005, ctx.currentTime);
        o.connect(g); g.connect(master);
        o.start();
        return o;
      });
      bgMusicRef.current = { ctx, oscs, master, stop: () => { oscs.forEach(o => { try { o.stop(); } catch(e) {} }); try { ctx.close(); } catch(e) {} bgMusicRef.current = null; } };
    } catch (e) {}
  }, [isMuted]);

  const stopBgMusic = useCallback(() => { if (bgMusicRef.current) { bgMusicRef.current.stop(); } }, []);

  useEffect(() => {
    if (gameState === "menu" && !isMuted) startBgMusic();
    else stopBgMusic();
    return () => { if (gameState !== "menu") stopBgMusic(); };
  }, [gameState, isMuted]);

  // ses efektleri - artık daha yüksek ses
  const audio = useCallback((t) => {
    if (isMuted) return;
    try {
      const A = window.AudioContext || window.webkitAudioContext; if (!A) return;
      const c = new A(), o = c.createOscillator(), g = c.createGain();
      o.connect(g); g.connect(c.destination);
      const cfg = { hit: [200, 0.12, 0.07], brick: [420, 0.22, 0.09], lose: [90, 0.18, 0.45], powerup: [560, 0.20, 0.18], levelup: [750, 0.18, 0.4] };
      const [freq, vol, dur] = cfg[t] || [300, 0.1, 0.1];
      o.frequency.setValueAtTime(freq, c.currentTime);
      if (t === "brick") { o.type = "square"; o.frequency.setValueAtTime(freq, c.currentTime); o.frequency.exponentialRampToValueAtTime(freq * 0.5, c.currentTime + dur); }
      g.gain.setValueAtTime(vol, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      o.start(); o.stop(c.currentTime + dur);
    } catch (e) {}
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
    bxRef.current = W / 2; byRef.current = H - 50;
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

  // Menü arka plan animasyonu (triangles + stars)
  useEffect(() => {
    if (gameState !== "menu") return;
    const cv = bgCanvasRef.current; if (!cv) return;
    const ctx = cv.getContext("2d");
    const cw = cv.width, ch = cv.height;
    let frame = 0;
    const triangles = [
      { x: 60, y: 220, size: 40, color: "#00e5ff", angle: 0, speed: 0.008, ox: 60, oy: 220, amp: 15 },
      { x: 320, y: 180, size: 30, color: "#ff00e5", angle: Math.PI / 3, speed: 0.01, ox: 320, oy: 180, amp: 12 },
      { x: 340, y: 320, size: 35, color: "#ff6600", angle: Math.PI, speed: 0.007, ox: 340, oy: 320, amp: 18 },
      { x: 30, y: 380, size: 28, color: "#7700ff", angle: Math.PI * 0.7, speed: 0.009, ox: 30, oy: 380, amp: 10 },
      { x: 280, y: 80, size: 22, color: "#00ffaa", angle: Math.PI * 1.5, speed: 0.012, ox: 280, oy: 80, amp: 8 },
    ];
    const stars = Array.from({ length: 60 }, () => ({ x: Math.random() * cw, y: Math.random() * ch, r: Math.random() * 1.5 + 0.3, a: Math.random() }));
    let aid;
    const drawTri = (t) => {
      ctx.save();
      ctx.strokeStyle = t.color; ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.55; ctx.shadowColor = t.color; ctx.shadowBlur = 8;
      const cx = t.x, cy = t.y, s = t.size;
      ctx.beginPath();
      ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s * 0.87, cy + s * 0.5); ctx.lineTo(cx - s * 0.87, cy + s * 0.5); ctx.closePath();
      ctx.stroke(); ctx.restore();
    };
    const loop = () => {
      ctx.clearRect(0, 0, cw, ch);
      // stars
      stars.forEach(s => { ctx.save(); ctx.globalAlpha = 0.3 + Math.sin(frame * 0.02 + s.a * 10) * 0.15; ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill(); ctx.restore(); });
      // triangles
      triangles.forEach(t => {
        t.x = t.ox + Math.sin(frame * t.speed) * t.amp;
        t.y = t.oy + Math.cos(frame * t.speed * 0.7) * (t.amp * 0.6);
        drawTri(t);
      });
      frame++;
      aid = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(aid);
  }, [gameState]);

  // Ana oyun döngüsü
  useEffect(() => {
    let aid;
    const drawBrick = (ctx, b) => {
      if (!b.status) return;
      const { x, y, width: bw, height: bh, rc } = b;
      const r = 6;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 6; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 4;
      const g = ctx.createLinearGradient(x, y, x, y + bh);
      g.addColorStop(0, rc.top); g.addColorStop(0.5, rc.mid); g.addColorStop(1, rc.bot);
      ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x, y, bw, bh, r); ctx.fill();
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      // Cam parlaması
      const sg = ctx.createLinearGradient(x, y, x, y + bh * 0.5);
      sg.addColorStop(0, rc.shine); sg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = sg; ctx.beginPath(); ctx.roundRect(x + 2, y + 2, bw - 4, bh * 0.48, [r - 1, r - 1, 2, 2]); ctx.fill();
      // Sol kenar parlaması (3D etki)
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.beginPath(); ctx.roundRect(x + 1, y + 2, 2, bh - 4, 1); ctx.fill();
      if (b.pu) { const icons = { LIFE: "♥", FREEZE: "❄", FIRE: "🔥", WIDE: "↔" }; ctx.font = `bold ${Math.floor(bh * 0.52)}px sans-serif`; ctx.fillStyle = "rgba(255,255,255,0.95)"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(icons[b.pu] || "?", x + bw / 2, y + bh / 2 + 1); }
      ctx.restore();
    };

    const update = () => {
      if (gsRef.current !== "playing" || pausedRef.current) return;
      bxRef.current += vxRef.current; byRef.current += vyRef.current;
      trailRef.current.push({ x: bxRef.current, y: byRef.current }); if (trailRef.current.length > 14) trailRef.current.shift();
      if (bxRef.current + BR > W || bxRef.current - BR < 0) { vxRef.current = -vxRef.current; audio("hit"); }
      if (byRef.current - BR < 0) { vyRef.current = -vyRef.current; audio("hit"); }
      if (vyRef.current > 0 && byRef.current + BR >= H - PH - 6 && bxRef.current >= pxRef.current && bxRef.current <= pxRef.current + pwRef.current) {
        const hitFactor = ((bxRef.current - pxRef.current) / pwRef.current - 0.5) * 2;
        const speed = Math.sqrt(vxRef.current * vxRef.current + vyRef.current * vyRef.current);
        const maxAngle = 65 * (Math.PI / 180);
        const angle = hitFactor * maxAngle;
        vxRef.current = speed * Math.sin(angle);
        vyRef.current = -Math.abs(speed * Math.cos(angle));
        if (Math.abs(vxRef.current) < 0.4) vxRef.current = hitFactor >= 0 ? 0.4 : -0.4;
        audio("hit"); comboRef.current = 0; setCombo(0);
      }
      if (byRef.current > H) { audio("lose"); comboRef.current = 0; setCombo(0); const nl = livesRef.current - 1; setLives(nl); if (nl <= 0) { setGameState("gameover"); submitScore(scoreRef.current, levelRef.current); } else resetBall(); }
      ptcRef.current = ptcRef.current.filter(p => p.life > 0); ptcRef.current.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.life -= p.decay; });
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
      // Arka plan
      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, "#06041a"); bg.addColorStop(0.5, "#0a0828"); bg.addColorStop(1, "#06041a");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      // ince yıldız noktaları
      ctx.save(); for (let i = 0; i < 45; i++) { ctx.fillStyle = `rgba(255,255,255,${0.04 + (i % 5) * 0.025})`; ctx.beginPath(); ctx.arc((i * 97 + 30) % W, (i * 71 + 15) % H, i % 5 === 0 ? 1.3 : 0.7, 0, Math.PI * 2); ctx.fill(); } ctx.restore();
      // neon kenar çerçevesi
      ctx.save(); ctx.strokeStyle = "rgba(120,60,255,0.35)"; ctx.lineWidth = 2; ctx.shadowColor = "#8040ff"; ctx.shadowBlur = 12; ctx.strokeRect(2, 2, W - 4, H - 4); ctx.restore();
      // Tuğlalar
      bricksRef.current.forEach(b => drawBrick(ctx, b));
      // Parçacıklar
      ptcRef.current.forEach(p => { ctx.save(); ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 7; ctx.beginPath(); ctx.roundRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size, 2); ctx.fill(); ctx.restore(); });
      // Düşen power-up'lar
      const pu_c = { WIDE: "#00d4ff", LIFE: "#ff3070", FREEZE: "#60c0ff", FIRE: "#ff8800" };
      const pu_l = { WIDE: "E", LIFE: "♥", FREEZE: "❄", FIRE: "F" };
      puRef.current.forEach(p => { const pc = pu_c[p.type] || "#fff"; ctx.save(); ctx.shadowColor = pc; ctx.shadowBlur = 16; ctx.strokeStyle = pc; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, 12, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = pc + "38"; ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = "#fff"; ctx.font = "bold 9px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(pu_l[p.type] || "?", p.x, p.y + 0.5); ctx.restore(); });
      // Pedal
      const py = H - PH - 5;
      ctx.save(); ctx.shadowColor = "#6060ff"; ctx.shadowBlur = 32;
      const pg = ctx.createLinearGradient(pxRef.current, py, pxRef.current, py + PH);
      pg.addColorStop(0, "#a0b8ff"); pg.addColorStop(0.35, "#5060ff"); pg.addColorStop(1, "#1020a0");
      ctx.fillStyle = pg; ctx.beginPath(); ctx.roundRect(pxRef.current, py, pwRef.current, PH, PH / 2); ctx.fill();
      ctx.shadowBlur = 0;
      // Pedal üst ışıltı
      const padShine = ctx.createLinearGradient(pxRef.current, py, pxRef.current + pwRef.current, py);
      padShine.addColorStop(0, "rgba(255,255,255,0)"); padShine.addColorStop(0.3, "rgba(255,255,255,0.6)"); padShine.addColorStop(0.7, "rgba(255,255,255,0.6)"); padShine.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = padShine; ctx.beginPath(); ctx.roundRect(pxRef.current + 4, py + 2.5, pwRef.current - 8, 2.5, 2); ctx.fill();
      ctx.restore();
      // Top
      let bc = "#ff3070", bg2 = "#ff1050"; if (fireRef.current) { bc = "#ff9000"; bg2 = "#ff6000"; } else if (frozenRef.current) { bc = "#70d0ff"; bg2 = "#40b0ff"; }
      trailRef.current.forEach((t, i) => { ctx.save(); ctx.globalAlpha = (i / trailRef.current.length) * 0.5; ctx.fillStyle = bc; ctx.beginPath(); ctx.arc(t.x, t.y, BR * (0.3 + i / trailRef.current.length * 0.7), 0, Math.PI * 2); ctx.fill(); ctx.restore(); });
      ctx.save(); ctx.shadowColor = bg2; ctx.shadowBlur = 32;
      const bgr = ctx.createRadialGradient(bxRef.current - 2.5, byRef.current - 2.5, 1, bxRef.current, byRef.current, BR);
      bgr.addColorStop(0, "#fff"); bgr.addColorStop(0.35, bc); bgr.addColorStop(1, bg2);
      ctx.fillStyle = bgr; ctx.beginPath(); ctx.arc(bxRef.current, byRef.current, BR, 0, Math.PI * 2); ctx.fill();
      if (fireRef.current || frozenRef.current) { ctx.strokeStyle = fireRef.current ? "rgba(255,160,0,0.7)" : "rgba(96,210,255,0.7)"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(bxRef.current, byRef.current, BR + 4, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
      // Durdurulmuş overlay
      if (pausedRef.current) {
        ctx.save(); ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#fff"; ctx.font = "bold 28px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.shadowColor = "#8040ff"; ctx.shadowBlur = 20;
        ctx.fillText("⏸  PAUSED", W / 2, H / 2 - 15);
        ctx.font = "14px sans-serif"; ctx.shadowBlur = 0; ctx.fillStyle = "rgba(255,255,255,0.6)";
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
  const wt = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error("t")), ms))]);
  const refCode = address ? address.slice(2, 8).toUpperCase() : "GUEST";
  const shareTxt = () => `Base Brick Breaker'da ${level}. seviyeye ulaşıp ${score} puanla çıtayı buraya koydum.\nAranızda bu skoru geçebilecek bir "Brick Master" var mı? Hodri meydan! 🔥`;
  const refLink = () => { if (typeof window === "undefined") return ""; const u = new URL(window.location.href); u.searchParams.set("ref", refCode); return u.toString(); };
  const fallback = async () => { try { if (navigator.share) await navigator.share({ text: shareTxt(), url: refLink() }); else { await navigator.clipboard.writeText(`${shareTxt()} ${refLink()}`); alert("Copied!"); } } catch (e) {} };
  const shareFarcaster = async () => { setShareMenuOpen(false); try { const { sdk } = await import("@farcaster/miniapp-sdk"); const inApp = await wt(sdk.isInMiniApp(), 1000).catch(() => false); if (!inApp) { await fallback(); return; } await wt(sdk.actions.composeCast({ text: shareTxt(), embeds: [refLink()] }), 2000); } catch (e) { await fallback(); } };
  const shareX = async () => { setShareMenuOpen(false); const xu = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareTxt())}&url=${encodeURIComponent(refLink())}`; try { const { sdk } = await import("@farcaster/miniapp-sdk"); const inApp = await wt(sdk.isInMiniApp(), 1000).catch(() => false); if (!inApp) { window.open(xu, "_blank"); return; } await wt(sdk.actions.openUrl(xu), 1500); } catch (e) { window.open(xu, "_blank"); } };

  if (!isSdkLoaded) return <div style={{ background: "#06041a", color: "#fff", padding: 40, textAlign: "center", borderRadius: 16, minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>Loading...</div>;

  const ShareMenu = () => shareMenuOpen ? (
    <div style={{ position: "absolute", bottom: "110%", right: 0, background: "#14103a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, overflow: "hidden", zIndex: 30, minWidth: 145 }}>
      <button onClick={shareFarcaster} style={{ width: "100%", padding: "11px 14px", background: "none", border: "none", color: "#c080ff", fontWeight: 700, fontSize: 11, cursor: "pointer", textAlign: "left" }}>🟣 Farcaster</button>
      <button onClick={shareX} style={{ width: "100%", padding: "11px 14px", background: "none", border: "none", color: "#b0b0c8", fontWeight: 700, fontSize: 11, cursor: "pointer", textAlign: "left", borderTop: "1px solid rgba(255,255,255,0.07)" }}>✖️ X (Twitter)</button>
    </div>
  ) : null;

  return (
    <div style={{ background: "linear-gradient(160deg, #060418 0%, #0c0828 50%, #060418 100%)", borderRadius: 20, overflow: "hidden", maxWidth: 440, margin: "0 auto", fontFamily: "'Arial Black', Arial, sans-serif" }}>

      {/* ===== MENÜ ===== */}
      {gameState === "menu" && (
        <div style={{ position: "relative", minHeight: 640, overflow: "hidden" }}>
          {/* Animasyonlu arka plan */}
          <canvas ref={bgCanvasRef} width={390} height={640} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />
          {/* İçerik */}
          <div style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column", alignItems: "center", padding: "18px 20px 20px", gap: 0 }}>
            {/* Üst bar */}
            <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <button style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>☰</button>
              <button onClick={() => isConnected ? disconnect() : (connectors[0] && connect({ connector: connectors[0] }))} style={{ padding: "7px 14px", borderRadius: 20, fontWeight: 700, fontSize: 11, cursor: "pointer", border: "1px solid rgba(0,220,200,0.4)", background: "rgba(0,220,200,0.12)", color: isConnected ? "#00dcc8" : "#80ffee" }}>
                {isConnected ? `${address.slice(0, 4)}...${address.slice(-4)}` : "Connect Wallet"}
              </button>
            </div>

            {/* Başlık */}
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              <div style={{ color: "#e0e0ff", fontWeight: 900, fontSize: 22, letterSpacing: 2, textShadow: "0 0 20px rgba(180,160,255,0.6)" }}>BASE BRICK</div>
              <div style={{ fontWeight: 900, fontSize: 44, letterSpacing: 3, background: "linear-gradient(135deg, #ff80ff 0%, #c040ff 40%, #6040ff 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", lineHeight: 1, textShadow: "none" }}>BREAKER</div>
              <div style={{ color: "#8080c0", fontSize: 10, fontWeight: 700, letterSpacing: 3, marginTop: 4 }}>CLASSIC ARCADE EDITION</div>
            </div>

            {/* Top + Pedal görsel */}
            <div style={{ position: "relative", width: 260, height: 180, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
              {/* Zemin ışığı */}
              <div style={{ position: "absolute", bottom: 42, left: "50%", transform: "translateX(-50%)", width: 180, height: 30, background: "radial-gradient(ellipse, rgba(120,80,255,0.5) 0%, transparent 70%)", filter: "blur(8px)" }} />
              {/* Işın çizgileri */}
              <div style={{ position: "absolute", bottom: 62, left: "50%", transform: "translateX(-50%)", width: 2, height: 100, background: "linear-gradient(180deg, rgba(150,100,255,0.8) 0%, transparent 100%)", boxShadow: "0 0 12px #8050ff" }} />
              <div style={{ position: "absolute", bottom: 62, left: "50%", transform: "translateX(-60%) rotate(-15deg)", width: 1.5, height: 80, background: "linear-gradient(180deg, rgba(100,200,255,0.5) 0%, transparent 100%)" }} />
              <div style={{ position: "absolute", bottom: 62, left: "50%", transform: "translateX(-40%) rotate(15deg)", width: 1.5, height: 80, background: "linear-gradient(180deg, rgba(100,200,255,0.5) 0%, transparent 100%)" }} />
              {/* Top */}
              <div style={{ position: "absolute", bottom: 120, left: "50%", transform: "translateX(-50%)", width: 52, height: 52, borderRadius: "50%", background: "radial-gradient(circle at 32% 28%, #ffffff, #d060ff 40%, #8030ff)", boxShadow: "0 0 30px #a050ff, 0 0 60px rgba(160,80,255,0.5), inset 0 -4px 10px rgba(0,0,0,0.3)" }} />
              {/* Pedal */}
              <div style={{ position: "absolute", bottom: 40, left: "50%", transform: "translateX(-50%)", width: 130, height: 18, borderRadius: 9, background: "linear-gradient(90deg, #a0b8ff, #6080ff, #a0b8ff)", boxShadow: "0 0 25px #6080ff, 0 0 50px rgba(96,128,255,0.4), 0 4px 12px rgba(0,0,0,0.4)" }}>
                <div style={{ position: "absolute", top: 3, left: "15%", right: "15%", height: 3, borderRadius: 2, background: "rgba(255,255,255,0.6)" }} />
              </div>
            </div>

            {/* Mod seçimi gizli (tour/practice) - mode toggle */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {["tournament", "practice"].map(m => (
                <button key={m} onClick={() => setGameMode(m)} style={{ padding: "6px 14px", borderRadius: 8, fontSize: 10, fontWeight: 700, cursor: "pointer", border: `1px solid ${gameMode === m ? "rgba(120,80,255,0.6)" : "rgba(255,255,255,0.12)"}`, background: gameMode === m ? "rgba(120,80,255,0.22)" : "rgba(255,255,255,0.05)", color: gameMode === m ? "#c0a0ff" : "#606090" }}>
                  {m === "tournament" ? "🏆 Tournament" : "🕹️ Practice"}
                </button>
              ))}
            </div>
            {gameMode === "tournament" && <div style={{ color: "#ff8040", fontSize: 9, fontWeight: 700, marginBottom: 10 }}>0.00001 ETH per game on Base</div>}

            {/* PLAY NOW */}
            <button onClick={startGame} disabled={isPaying} style={{ width: "100%", padding: "17px", borderRadius: 16, fontWeight: 900, fontSize: 18, letterSpacing: 2, cursor: isPaying ? "not-allowed" : "pointer", border: "none", background: "linear-gradient(135deg, #ff2060 0%, #cc2090 40%, #8020c0 100%)", color: "#fff", boxShadow: "0 0 30px rgba(200,40,150,0.55), 0 4px 20px rgba(0,0,0,0.4)", opacity: isPaying ? 0.65 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 20 }}>▶</span>{isPaying ? "CONFIRMING..." : "PLAY NOW"}
            </button>
            {paymentError && <div style={{ color: "#ff5060", fontSize: 10, textAlign: "center", marginTop: -6, marginBottom: 6 }}>{paymentError}</div>}

            {/* Alt butonlar */}
            <div style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <button onClick={() => setGameMode(m => m)} style={{ padding: "13px 8px", borderRadius: 14, fontWeight: 700, fontSize: 12, cursor: "pointer", border: "1px solid rgba(200,140,40,0.4)", background: "rgba(180,120,20,0.18)", color: "#ffcc44", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                🏆 TOURNAMENT
              </button>
              <button onClick={openLB} style={{ padding: "13px 8px", borderRadius: 14, fontWeight: 700, fontSize: 12, cursor: "pointer", border: "1px solid rgba(60,120,255,0.4)", background: "rgba(40,80,220,0.18)", color: "#6090ff", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                📊 LEADERBOARD
              </button>
            </div>
            <div style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button style={{ padding: "13px 8px", borderRadius: 14, fontWeight: 700, fontSize: 12, cursor: "not-allowed", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#505070", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                🛒 SHOP
              </button>
              <button onClick={() => setIsMuted(m => !m)} style={{ padding: "13px 8px", borderRadius: 14, fontWeight: 700, fontSize: 12, cursor: "pointer", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#8090c0", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {isMuted ? "🔇" : "⚙️"} SETTINGS
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== OYUN EKRANI ===== */}
      {(gameState === "playing" || gameState === "gameover") && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {/* Başlık */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px 8px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <div>
              <div style={{ color: "#c0c0ff", fontWeight: 900, fontSize: 13, letterSpacing: 1.5 }}>BASE BRICK</div>
              <div style={{ fontWeight: 900, fontSize: 16, background: "linear-gradient(135deg, #ff80ff, #8040ff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: 1 }}>BREAKER</div>
              <div style={{ color: "#504070", fontSize: 8, fontWeight: 700, letterSpacing: 2 }}>CLASSIC ARCADE EDITION</div>
            </div>
            <button onClick={() => isConnected ? disconnect() : (connectors[0] && connect({ connector: connectors[0] }))} style={{ padding: "5px 10px", borderRadius: 20, fontWeight: 700, fontSize: 11, cursor: "pointer", border: "1px solid rgba(0,220,200,0.35)", background: "rgba(0,220,200,0.1)", color: "#00dcc8" }}>
              {isConnected ? `${address.slice(0, 4)}...${address.slice(-4)}` : "Connect"}
            </button>
          </div>

          {/* Skor barı */}
          <div style={{ display: "flex", justifyContent: "space-around", alignItems: "center", padding: "8px 14px", background: "rgba(0,0,0,0.38)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ textAlign: "center" }}><div style={{ color: "#504070", fontSize: 9, fontWeight: 700, letterSpacing: 1.5 }}>SCORE</div><div style={{ color: "#00e5ff", fontWeight: 900, fontSize: 16 }}>{score.toLocaleString()}</div></div>
            <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.08)" }} />
            <div style={{ textAlign: "center" }}><div style={{ color: "#504070", fontSize: 9, fontWeight: 700, letterSpacing: 1.5 }}>LIVES</div><div style={{ color: "#ff3070", fontWeight: 900, fontSize: 15 }}>{"❤️".repeat(Math.max(0, lives))}</div></div>
            <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.08)" }} />
            <div style={{ textAlign: "center" }}><div style={{ color: "#504070", fontSize: 9, fontWeight: 700, letterSpacing: 1.5 }}>LEVEL</div><div style={{ color: "#b060ff", fontWeight: 900, fontSize: 16 }}>{level}</div></div>
          </div>

          {/* Canvas */}
          <div style={{ position: "relative" }}>
            <canvas ref={canvasRef} width={W} height={H} onPointerMove={onMove} onTouchMove={onTouch} onTouchStart={onTouch} style={{ width: "100%", display: "block", touchAction: "none", cursor: "crosshair" }} />
            {/* Combo */}
            {showCombo && combo > 1 && <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", color: "#ffd000", fontWeight: 900, fontSize: 16, textShadow: "0 0 14px #ffd000", pointerEvents: "none", whiteSpace: "nowrap" }}>x{combo} COMBO! 🔥</div>}
            {/* Aktif power-up */}
            {activePowerUp && <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,200,255,0.16)", border: "1px solid rgba(0,200,255,0.4)", borderRadius: 8, padding: "3px 8px", color: "#00e5ff", fontSize: 9, fontWeight: 700 }}>{activePowerUp} ACTIVE</div>}
            {/* Duraklat / Devam butonları */}
            <button onClick={() => setIsPaused(p => !p)} style={{ position: "absolute", bottom: 10, left: 10, width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {isPaused ? "▶" : "⏸"}
            </button>
            <button onClick={openLB} style={{ position: "absolute", bottom: 10, right: 10, width: 36, height: 36, borderRadius: "50%", background: "rgba(255,200,0,0.12)", border: "1px solid rgba(255,200,0,0.3)", color: "#ffd000", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
              ⚡
            </button>

            {/* Game Over Overlay */}
            {gameState === "gameover" && (
              <div style={{ position: "absolute", inset: 0, background: "rgba(4,2,20,0.92)", backdropFilter: "blur(6px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 24 }}>
                <div style={{ fontWeight: 900, fontSize: 40, letterSpacing: 3, background: "linear-gradient(135deg, #ff4060, #ff8000)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", textShadow: "none" }}>GAME OVER</div>
                {isNewHigh && <div style={{ color: "#ffd000", fontWeight: 700, fontSize: 14, letterSpacing: 1 }}>🌟 NEW HIGH SCORE!</div>}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0, background: "rgba(255,255,255,0.06)", borderRadius: 18, padding: "16px 12px", border: "1px solid rgba(255,255,255,0.1)", width: "100%" }}>
                  {[{ l: "SCORE", v: score.toLocaleString(), c: "#fff" }, { l: "BEST SCORE", v: Math.max(score, bestScore).toLocaleString(), c: "#ffd000" }, { l: "LEVEL", v: level, c: "#b060ff" }].map((s, i) => (
                    <div key={s.l} style={{ textAlign: "center", padding: "4px 0", borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.08)" : "none" }}>
                      <div style={{ color: "#504070", fontSize: 9, fontWeight: 700, letterSpacing: 1 }}>{s.l}</div>
                      <div style={{ color: s.c, fontWeight: 900, fontSize: 20 }}>{s.v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 16, marginTop: 6, alignItems: "center" }}>
                  <button onClick={() => setGameState("menu")} style={{ width: 62, height: 62, borderRadius: "50%", background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.18)", color: "#fff", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, gap: 2 }}>
                    <span style={{ fontSize: 22 }}>🏠</span>HOME
                  </button>
                  <button onClick={startGame} disabled={isPaying} style={{ width: 82, height: 82, borderRadius: "50%", background: "linear-gradient(135deg, #c060ff, #8030ff)", border: "2px solid rgba(220,150,255,0.6)", color: "#fff", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, gap: 2, boxShadow: "0 0 30px rgba(180,80,255,0.75), 0 0 60px rgba(150,50,255,0.3), inset 0 1px 2px rgba(255,255,255,0.3)", opacity: isPaying ? 0.65 : 1, animation: undefined }}>
                    <span style={{ fontSize: 26 }}>↺</span>RETRY
                  </button>
                  <div style={{ position: "relative" }}>
                    <button onClick={() => setShareMenuOpen(o => !o)} style={{ width: 62, height: 62, borderRadius: "50%", background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.18)", color: "#fff", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, gap: 2 }}>
                      <span style={{ fontSize: 22 }}>📤</span>SHARE
                    </button>
                    <ShareMenu />
                  </div>
                </div>
                {paymentError && <div style={{ color: "#ff5060", fontSize: 10 }}>{paymentError}</div>}
              </div>
            )}
          </div>

          {/* Power-ups paneli - canlı ve renkli */}
          <div style={{ background: "linear-gradient(180deg, #0c0828 0%, #100c30 100%)", borderTop: "1px solid rgba(120,80,255,0.25)", padding: "10px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ color: "#5040a0", fontSize: 9, fontWeight: 700, letterSpacing: 2 }}>POWER-UPS</div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                {[
                  { k: "WIDE", ic: "↔", lb: "EXPAND", c: "#00d4ff", bg: "rgba(0,212,255,0.15)", border: "rgba(0,212,255,0.45)" },
                  { k: "FIRE", ic: "🔥", lb: "FIRE", c: "#ff9000", bg: "rgba(255,144,0,0.15)", border: "rgba(255,144,0,0.45)" },
                  { k: "LIFE", ic: "❤️", lb: "EXTRA LIFE", c: "#ff3070", bg: "rgba(255,48,112,0.15)", border: "rgba(255,48,112,0.45)" },
                  { k: "FREEZE", ic: "❄️", lb: "SLOW BALL", c: "#60c8ff", bg: "rgba(96,200,255,0.15)", border: "rgba(96,200,255,0.45)" },
                ].map(pu => {
                  const active = puCounts[pu.k] > 0;
                  return (
                    <div key={pu.k} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 11, background: active ? pu.bg : "rgba(255,255,255,0.04)", border: `1.5px solid ${active ? pu.border : "rgba(255,255,255,0.08)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, opacity: active ? 1 : 0.35, boxShadow: active ? `0 0 12px ${pu.c}40` : "none", transition: "all 0.3s" }}>
                        {pu.ic}
                      </div>
                      <div style={{ color: active ? pu.c : "#3a2060", fontSize: 11, fontWeight: 900 }}>{puCounts[pu.k]}</div>
                      <div style={{ color: "#3a2060", fontSize: 7, letterSpacing: 0.3, whiteSpace: "nowrap" }}>{pu.lb}</div>
                    </div>
                  );
                })}
              </div>
              <button onClick={() => setIsMuted(m => !m)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", opacity: 0.6 }}>{isMuted ? "🔇" : "🎵"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== LEVEL UP ===== */}
      {gameState === "levelup" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "45px 22px", gap: 18, minHeight: 600, background: "linear-gradient(180deg, #06001e 0%, #18006a 50%, #06001e 100%)" }}>
          <div style={{ fontWeight: 900, fontSize: 40, letterSpacing: 3, color: "#e060ff", textShadow: "0 0 40px #c040ff, 0 0 80px rgba(200,64,255,0.4)" }}>LEVEL UP!</div>
          <div style={{ color: "#8090b0", fontWeight: 700, fontSize: 13, letterSpacing: 3 }}>YOU REACHED</div>
          <div style={{ fontWeight: 900, fontSize: 56, color: "#00d4ff", textShadow: "0 0 35px #00b0ff" }}>LEVEL {level}</div>
          <div style={{ width: 78, height: 78, borderRadius: "50%", background: "radial-gradient(circle at 32% 28%, #fff, #c060ff)", boxShadow: "0 0 55px #8040ff, 0 0 110px rgba(128,64,255,0.45)", margin: "8px 0" }} />
          <div style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {[{ l: "SCORE", v: score.toLocaleString(), c: "#fff" }, { l: "XP GAINED", v: `+${xpGained} XP`, c: "#a070ff" }].map(s => (
              <div key={s.l} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 18, padding: 18, textAlign: "center" }}>
                <div style={{ color: "#504070", fontSize: 9, fontWeight: 700, letterSpacing: 1.5 }}>{s.l}</div>
                <div style={{ color: s.c, fontWeight: 900, fontSize: 28, marginTop: 4 }}>{s.v}</div>
              </div>
            ))}
          </div>
          <button onClick={doNextLevel} style={{ width: "100%", padding: 18, borderRadius: 18, fontWeight: 900, fontSize: 17, letterSpacing: 2, cursor: "pointer", border: "none", background: "linear-gradient(135deg, #8040ff, #5020c0)", color: "#fff", boxShadow: "0 0 35px rgba(120,64,255,0.55)" }}>▶  NEXT LEVEL</button>
          <button onClick={openLB} style={{ width: "100%", padding: 14, borderRadius: 16, fontWeight: 700, fontSize: 12, letterSpacing: 1.5, cursor: "pointer", border: "1px solid rgba(255,200,0,0.3)", background: "rgba(255,200,0,0.09)", color: "#ffd000" }}>🏆 LEADERBOARD</button>
        </div>
      )}

      {/* ===== LEADERBOARD ===== */}
      {gameState === "leaderboard" && (
        <div style={{ minHeight: 600, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <button onClick={() => setGameState(prevState || "menu")} style={{ background: "none", border: "none", color: "#7060a0", cursor: "pointer", fontSize: 22 }}>←</button>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 22 }}>🏆</span><span style={{ color: "#fff", fontWeight: 900, fontSize: 17, letterSpacing: 1.5 }}>LEADERBOARD</span></div>
            {isConnected ? <span style={{ color: "#e060ff", fontSize: 10, fontWeight: 700 }}>{address.slice(0, 4)}...{address.slice(-4)}</span> : <span />}
          </div>
          <div style={{ display: "flex", gap: 6, padding: "10px 16px 8px" }}>
            {["GLOBAL", "FRIENDS", "TOURNAMENT"].map((t, i) => (
              <button key={t} style={{ padding: "7px 12px", borderRadius: 9, fontWeight: 700, fontSize: 10, cursor: "pointer", border: "none", background: i === 0 ? "#7040ff" : "rgba(255,255,255,0.05)", color: i === 0 ? "#fff" : "#504080" }}>{t}</button>
            ))}
          </div>
          <div style={{ padding: "4px 16px", display: "flex", flexDirection: "column", gap: 7, flex: 1, overflowY: "auto", maxHeight: 360 }}>
            {leaderboardLoading ? <div style={{ color: "#504080", textAlign: "center", padding: 30 }}>Loading...</div>
              : leaderboardRows.length === 0 ? <div style={{ color: "#504080", textAlign: "center", padding: 30, fontSize: 12 }}>No scores yet. Be the first!</div>
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
            <button onClick={startGame} disabled={isPaying} style={{ padding: 14, borderRadius: 16, fontWeight: 900, fontSize: 13, letterSpacing: 1, cursor: "pointer", border: "none", background: "linear-gradient(135deg, #e060ff, #a040ff)", color: "#fff", boxShadow: "0 0 20px rgba(200,64,255,0.4)", opacity: isPaying ? 0.6 : 1 }}>
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
