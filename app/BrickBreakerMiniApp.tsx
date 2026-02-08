"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMiniKit } from "@coinbase/onchainkit/minikit";

type GameState = "idle" | "running" | "paused" | "gameover" | "win";
type Brick = { x: number; y: number; w: number; h: number; alive: boolean; hp: number };
type Ball = { x: number; y: number; r: number; vx: number; vy: number; launched: boolean };

type Particle = { x: number; y: number; vx: number; vy: number; r: number; life: number };
type LBEntry = { name: string; score: number; level: number; t: number };

type PowerUpType = "widen" | "multiball" | "slow";
type Drop = { x: number; y: number; vy: number; size: number; type: PowerUpType; alive: boolean };

// Remote LB entry (normalized for UI)
type RemoteLBEntry = { name: string; score: number; level: number; t: number };

// ---------- EIP-1193 + window declarations (no-any) ----------
type EIP1193RequestArgs = { method: string; params?: unknown[] | Record<string, unknown> };
type EIP1193Provider = { request: <T = unknown>(args: EIP1193RequestArgs) => Promise<T> };

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
    webkitAudioContext?: typeof AudioContext;
  }
}

// ---------- small helpers ----------
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function hashStringToSeed(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function yesterdayKeyFrom(dailyId: string) {
  const [y, m, da] = dailyId.split("-").map(Number);
  const d = new Date(y, (m || 1) - 1, da || 1);
  d.setDate(d.getDate() - 1);
  return dateKey(d);
}
function shortAddr(addr?: string | null) {
  if (!addr) return "anon";
  const a = addr.trim();
  if (a.length <= 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function circleRectCollide(cx: number, cy: number, r: number, rx: number, ry: number, rw: number, rh: number) {
  const closestX = clamp(cx, rx, rx + rw);
  const closestY = clamp(cy, ry, ry + rh);
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy <= r * r;
}

export default function BrickBreakerMiniApp() {
  const miniKit = useMiniKit();

  // --- Daily id
  const [dailyId] = useState(() => dateKey(new Date()));
  const dailyIdRef = useRef(dailyId);

  // --- User / key
  const [userAddr, setUserAddr] = useState<string>("");
  const [userKey, setUserKey] = useState<string>("anon");
  const userKeyRef = useRef<string>("anon");

  // --- Mode
  const [practiceMode, setPracticeMode] = useState(false);
  const [practiceInfiniteLives, setPracticeInfiniteLives] = useState(false);

  // --- Game state
  const [gameState, setGameState] = useState<GameState>("idle");
  const gameStateRef = useRef<GameState>("idle");

  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);

  // Keep latest score/level for accurate commits (avoid stale closure)
  const scoreRef = useRef(0);
  const levelRef = useRef(1);
  useEffect(() => {
    scoreRef.current = score;
  }, [score]);
  useEffect(() => {
    levelRef.current = level;
  }, [level]);

  // --- Daily meta
  const [todayBest, setTodayBest] = useState<number>(0);
  const [streak, setStreak] = useState<number>(0);

  // --- Attempts
  const DAILY_ATTEMPTS = Infinity;
  const [attemptsLeft, setAttemptsLeft] = useState<number>(DAILY_ATTEMPTS);
  const attemptsLeftRef = useRef<number>(DAILY_ATTEMPTS);

  // --- Preferences
  const [soundOn, setSoundOn] = useState<boolean>(false);
  const [hapticsOn, setHapticsOn] = useState<boolean>(true);

  // --- Leaderboard (local + remote)
  const [lbOpen, setLbOpen] = useState(false);
  const [lb, setLb] = useState<LBEntry[]>([]);
  const [remoteLb, setRemoteLb] = useState<RemoteLBEntry[]>([]);
  const [remoteLbErr, setRemoteLbErr] = useState<string | null>(null);

  // --- UI toast
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const GAME_W = 360;
  const GAME_H = 520;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTRef = useRef<number>(0);
  const pointerDownRef = useRef(false);

  const shimmerTRef = useRef<number>(0);
  const [scale, setScale] = useState(1);

  // Paddle smoothing
  const paddleRef = useRef({ x: GAME_W / 2, targetX: GAME_W / 2, y: GAME_H - 54, w: 92, h: 18 });
  const ballsRef = useRef<Ball[]>([{ x: GAME_W / 2, y: GAME_H - 74, r: 7, vx: 0, vy: 0, launched: false }]);

  const bricksRef = useRef<Brick[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const dropsRef = useRef<Drop[]>([]);

  // Timed effects
  const slowUntilRef = useRef<number>(0);
  const widenUntilRef = useRef<number>(0);

  // Prevent duplicate commits per state/day
  const lastCommitKeyRef = useRef<string>("");

  const ui = useMemo(() => ({ headerH: 44, wall: 10, brickGap: 6 }), []);

  // --- Audio
  const audioCtxRef = useRef<AudioContext | null>(null);
  const ensureAudio = useCallback(() => {
    if (audioCtxRef.current) return audioCtxRef.current;
    const AnyAudioCtx = window.AudioContext ?? window.webkitAudioContext;
    if (!AnyAudioCtx) return null;
    audioCtxRef.current = new AnyAudioCtx();
    return audioCtxRef.current;
  }, []);

  const beep = useCallback(
    (freq: number, durMs: number, gain: number) => {
      if (!soundOn) return;
      const ctx = ensureAudio();
      if (!ctx) return;
      try {
        if (ctx.state === "suspended") void ctx.resume();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = freq;
        g.gain.value = gain;
        o.connect(g);
        g.connect(ctx.destination);
        const now = ctx.currentTime;
        o.start(now);
        o.stop(now + durMs / 1000);
      } catch {}
    },
    [ensureAudio, soundOn]
  );

  const haptic = useCallback(
    (ms: number) => {
      if (!hapticsOn) return;
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        const vib = (navigator as Navigator & { vibrate?: (pattern: number | number[]) => boolean }).vibrate;
        vib?.(ms);
      }
    },
    [hapticsOn]
  );

  const showToast = useCallback((msg: string, ms = 1400) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), ms);
  }, []);

  // Sync refs
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);
  useEffect(() => {
    attemptsLeftRef.current = attemptsLeft;
  }, [attemptsLeft]);

  // MiniKit lifecycle
  useEffect(() => {
    const mk = miniKit as unknown as { ready?: () => void; actions?: { ready?: () => void } };
    mk.ready?.();
    mk.actions?.ready?.();
  }, [miniKit]);

  // Resolve user
  useEffect(() => {
    const mk = miniKit as unknown as { user?: { address?: string }; context?: { user?: { address?: string } } };
    const addr = mk.user?.address ?? mk.context?.user?.address;
    const normalized = (addr || "").toLowerCase().trim();
    setUserAddr(normalized);
    const key = normalized ? `addr_${normalized}` : "anon";
    setUserKey(key);
    userKeyRef.current = key;
  }, [miniKit]);

  // storage keys
  const keyDailyBest = useCallback(() => `bb_${userKeyRef.current}_daily_best_${dailyIdRef.current}`, []);
  const keyDailyAttempts = useCallback(() => `bb_${userKeyRef.current}_daily_attempts_${dailyIdRef.current}`, []);
  const keyStreakLast = useCallback(() => `bb_${userKeyRef.current}_streak_last`, []);
  const keyStreakCount = useCallback(() => `bb_${userKeyRef.current}_streak_count`, []);
  const keyPrefs = useCallback(() => `bb_${userKeyRef.current}_prefs`, []);
  const keyLeaderboard = useCallback(() => `bb_lb_${dailyIdRef.current}`, []);

  // scale
  useEffect(() => {
    function compute() {
      const el = containerRef.current;
      if (!el) return;
      setScale(clamp(el.clientWidth / GAME_W, 0.9, 1.6));
    }
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  // ---------------- Remote leaderboard helpers ----------------
  const randomNonce = useCallback(() => `${Date.now()}_${Math.random().toString(16).slice(2)}`, []);

  const signMessageCompat = useCallback(async (message: string): Promise<{ address: string; signature: string } | null> => {
    const eth = typeof window !== "undefined" ? window.ethereum : undefined;
    if (!eth?.request) return null;

    const accounts = await eth.request<string[]>({ method: "eth_requestAccounts" });
    const from = accounts?.[0];
    if (!from) return null;

    const signature = await eth.request<string>({
      method: "personal_sign",
      params: [message, from],
    });

    if (!signature) return null;
    return { address: from.toLowerCase(), signature };
  }, []);

  const fetchRemoteLeaderboard = useCallback(async (dId: string): Promise<void> => {
    setRemoteLbErr(null);

    const res = await fetch(`/api/leaderboard?dailyId=${encodeURIComponent(dId)}&limit=10`, { method: "GET" });
    const json = await safeJson(res);

    if (!res.ok) {
      const err = isRecord(json) ? String(json.error ?? "leaderboard fetch failed") : "leaderboard fetch failed";
      setRemoteLbErr(err);
      throw new Error(err);
    }

    const entriesRaw = isRecord(json) ? (json.entries ?? json.data ?? json.leaderboard) : json;
    if (!Array.isArray(entriesRaw)) {
      setRemoteLb([]);
      return;
    }

    const mapped: RemoteLBEntry[] = entriesRaw
      .map((e: unknown) => {
        if (!isRecord(e)) return null;

        const scoreN = Number(e.score);
        const levelN = Number(e.level ?? e.lvl);
        const address = typeof e.address === "string" ? e.address : "";
        const name = typeof e.name === "string" ? e.name : shortAddr(address);

        const t =
          typeof e.t === "number"
            ? e.t
            : typeof e.createdAt === "number"
              ? e.createdAt
              : typeof e.createdAt === "string"
                ? Date.parse(e.createdAt)
                : Date.now();

        if (!Number.isFinite(scoreN) || !Number.isFinite(levelN)) return null;
        return { name, score: scoreN, level: levelN, t: Number.isFinite(t) ? t : Date.now() };
      })
      .filter((x): x is RemoteLBEntry => Boolean(x));

    mapped.sort((a, b) => b.score - a.score || b.level - a.level || b.t - a.t);
    setRemoteLb(mapped.slice(0, 10));
  }, []);

  const submitRemoteScore = useCallback(
    async (finalScore: number, finalLevel: number) => {
      if (practiceMode) return;

      const nonce = randomNonce();
      const msg = `BrickBreaker Daily ${dailyId} Score ${finalScore} Level ${finalLevel} Nonce ${nonce}`;

      const signed = await signMessageCompat(msg);
      if (!signed) throw new Error("No wallet signer available");

      const res = await fetch("/api/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dailyId,
          address: signed.address,
          score: finalScore,
          level: finalLevel,
          mode: "daily",
          nonce,
          message: msg,
          signature: signed.signature,
        }),
      });

      const json = await safeJson(res);
      if (!res.ok) {
        const err = isRecord(json) ? String(json.error ?? "submit failed") : "submit failed";
        throw new Error(err);
      }
    },
    [dailyId, practiceMode, randomNonce, signMessageCompat]
  );
  // ---------------------------------------------------------------------------

  // prefs load/save
  useEffect(() => {
    const raw = localStorage.getItem(keyPrefs());
    if (!raw) return;
    try {
      const obj = JSON.parse(raw) as { soundOn?: boolean; hapticsOn?: boolean };
      if (typeof obj.soundOn === "boolean") setSoundOn(obj.soundOn);
      if (typeof obj.hapticsOn === "boolean") setHapticsOn(obj.hapticsOn);
    } catch {}
  }, [userKey, keyPrefs]);

  useEffect(() => {
    try {
      localStorage.setItem(keyPrefs(), JSON.stringify({ soundOn, hapticsOn }));
    } catch {}
  }, [soundOn, hapticsOn, userKey, keyPrefs]);

  // leaderboard load (local)
  useEffect(() => {
    const raw = localStorage.getItem(keyLeaderboard());
    if (!raw) return setLb([]);
    try {
      const arr = JSON.parse(raw) as LBEntry[];
      setLb(Array.isArray(arr) ? arr : []);
    } catch {
      setLb([]);
    }
  }, [dailyId, keyLeaderboard]);

  // leaderboard load (remote)
  useEffect(() => {
    fetchRemoteLeaderboard(dailyId).catch(() => {});
  }, [dailyId, fetchRemoteLeaderboard]);

  const saveLeaderboard = useCallback(
    (entry: LBEntry) => {
      const raw = localStorage.getItem(keyLeaderboard());
      let arr: LBEntry[] = [];
      try {
        arr = raw ? (JSON.parse(raw) as LBEntry[]) : [];
      } catch {
        arr = [];
      }
      arr = Array.isArray(arr) ? arr : [];
      arr.push(entry);
      arr.sort((a, b) => b.score - a.score || b.level - a.level || b.t - a.t);
      arr = arr.slice(0, 10);
      localStorage.setItem(keyLeaderboard(), JSON.stringify(arr));
      setLb(arr);
    },
    [keyLeaderboard]
  );

  // Daily best load
  useEffect(() => {
    const raw = localStorage.getItem(keyDailyBest());
    const n = raw ? Number(raw) : 0;
    setTodayBest(Number.isFinite(n) ? n : 0);
  }, [dailyId, userKey, keyDailyBest]);

  // Streak
  useEffect(() => {
    const last = localStorage.getItem(keyStreakLast());
    const prevRaw = localStorage.getItem(keyStreakCount());
    const prev = prevRaw ? Number(prevRaw) : 0;
    const safePrev = Number.isFinite(prev) ? prev : 0;

    const yesterday = yesterdayKeyFrom(dailyId);

    let nextCount = safePrev;
    if (last === dailyId) nextCount = safePrev;
    else if (last === yesterday) nextCount = safePrev + 1;
    else nextCount = 1;

    localStorage.setItem(keyStreakLast(), dailyId);
    localStorage.setItem(keyStreakCount(), String(nextCount));
    setStreak(nextCount);
  }, [dailyId, userKey, keyStreakLast, keyStreakCount]);

  // Attempts
  useEffect(() => {
    if (DAILY_ATTEMPTS === Infinity) {
  setAttemptsLeft(Infinity);
  attemptsLeftRef.current = Infinity;
  return;
}
    const saved = localStorage.getItem(keyDailyAttempts());
    if (saved === null) {
      localStorage.setItem(keyDailyAttempts(), String(DAILY_ATTEMPTS));
      setAttemptsLeft(DAILY_ATTEMPTS);
      attemptsLeftRef.current = DAILY_ATTEMPTS;
    } else {
      const n = Number(saved);
      const val = Number.isFinite(n) ? n : DAILY_ATTEMPTS;
      setAttemptsLeft(val);
      attemptsLeftRef.current = val;
    }
  }, [dailyId, userKey, keyDailyAttempts]);

  const makeLevelBricks = useCallback(
    (lvl: number) => {
      const seed = hashStringToSeed(`${dailyIdRef.current}-${userKeyRef.current}-lvl-${lvl}`);
      const rand = mulberry32(seed);

      const rows = clamp(4 + Math.floor((lvl - 1) * 1.2), 4, 8);
      const cols = 7;
      const gap = ui.brickGap;
      const top = ui.headerH + 18;
      const side = 14;
      const usableW = GAME_W - side * 2;
      const brickW = Math.floor((usableW - gap * (cols - 1)) / cols);
      const brickH = 18;

      const bricks: Brick[] = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          bricks.push({
            x: side + c * (brickW + gap),
            y: top + r * (brickH + gap),
            w: brickW,
            h: brickH,
            alive: true,
            hp: rand() < 0.18 ? 2 : 1,
          });
        }
      }
      bricksRef.current = bricks;
      dropsRef.current = [];
    },
    [ui.brickGap, ui.headerH]
  );

  const resetBallsToPaddle = useCallback(() => {
    const p = paddleRef.current;
    ballsRef.current = [{ x: p.x, y: p.y - 20, r: 7, vx: 0, vy: 0, launched: false }];
  }, []);

  const resetRound = useCallback(() => {
    const p = paddleRef.current;
    p.x = GAME_W / 2;
    p.targetX = GAME_W / 2;
    p.w = 92;
    p.h = 18;

    slowUntilRef.current = 0;
    widenUntilRef.current = 0;

    resetBallsToPaddle();
  }, [resetBallsToPaddle]);

  const resetGame = useCallback(
    (nextLevel = 1) => {
      setScore(0);
      setLives(3);
      setLevel(nextLevel);
      makeLevelBricks(nextLevel);
      resetRound();
      setGameState("idle");
      particlesRef.current = [];
      lastCommitKeyRef.current = ""; // allow commits on new run
    },
    [makeLevelBricks, resetRound]
  );

  // init & user change
  useEffect(() => {
    makeLevelBricks(1);
    resetRound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userKey]);

  const maybeUpdateDailyBest = useCallback(
    (finalScore: number) => {
      if (practiceMode) return;
      const current = todayBest || 0;
      if (finalScore > current) {
        setTodayBest(finalScore);
        localStorage.setItem(keyDailyBest(), String(finalScore));
      }
    },
    [practiceMode, todayBest, keyDailyBest]
  );

  const spendAttemptIfNeeded = useCallback((): boolean => {
    if (practiceMode) return true;
    if (DAILY_ATTEMPTS === Infinity) return true;
    if (gameStateRef.current !== "idle") return true;

    const current = attemptsLeftRef.current;
    if (current <= 0) {
      showToast("No attempts left today ❌");
      haptic(40);
      beep(220, 60, 0.05);
      return false;
    }

    const next = current - 1;
    attemptsLeftRef.current = next;
    setAttemptsLeft(next);
    localStorage.setItem(keyDailyAttempts(), String(next));
    return true;
  }, [practiceMode, beep, haptic, keyDailyAttempts, showToast]);

  const baseBallSpeed = useCallback(() => {
    const now = performance.now();
    const slow = now < slowUntilRef.current;
    return slow ? 190 : 240;
  }, []);

  const launchBalls = useCallback(() => {
    if (!spendAttemptIfNeeded()) return;

    ensureAudio();

    const balls = ballsRef.current;
    if (balls.some((b) => b.launched)) return;

    const p = paddleRef.current;
    const speed = baseBallSpeed();

    for (const b of balls) {
      b.x = p.x;
      b.y = p.y - 20;
      b.launched = true;

      const base = (Math.random() * 0.6 + 0.2) * (Math.random() < 0.5 ? -1 : 1);
      b.vx = base * speed;
      b.vy = -Math.sqrt(Math.max(0, speed * speed - b.vx * b.vx));
    }

    setGameState("running");
    haptic(15);
    beep(420, 50, 0.03);
  }, [baseBallSpeed, beep, ensureAudio, haptic, spendAttemptIfNeeded]);

  const nextLevelFn = useCallback(() => {
    setLevel((prev) => {
      const next = prev + 1;
      makeLevelBricks(next);
      resetRound();
      setGameState("idle");
      return next;
    });
  }, [makeLevelBricks, resetRound]);

  const spawnWinParticles = useCallback(() => {
    const count = 90;
    const rand = mulberry32(hashStringToSeed(`${dailyIdRef.current}-${userKeyRef.current}-win-${Date.now()}`));
    const parts: Particle[] = [];
    for (let i = 0; i < count; i++) {
      parts.push({
        x: rand() * GAME_W,
        y: ui.headerH + rand() * 40,
        vx: (rand() * 2 - 1) * 150,
        vy: -rand() * 240,
        r: 2 + rand() * 3,
        life: 1.2 + rand() * 0.9,
      });
    }
    particlesRef.current = parts;
  }, [ui.headerH]);

  const canCommitOnce = useCallback(
    (state: "win" | "gameover") => {
      const key = `${dailyId}:${state}`;
      if (lastCommitKeyRef.current === key) return false;
      lastCommitKeyRef.current = key;
      return true;
    },
    [dailyId]
  );

  const commitLeaderboardIfNeeded = useCallback(
    (finalState: "win" | "gameover") => {
      if (practiceMode) return;
      if (!canCommitOnce(finalState)) return;

      const finalScore = scoreRef.current;
      const finalLevel = levelRef.current;

      const entry: LBEntry = {
        name: shortAddr(userAddr || userKeyRef.current),
        score: finalScore,
        level: finalLevel,
        t: Date.now(),
      };

      // local
      saveLeaderboard(entry);

      // remote (best-effort)
      submitRemoteScore(finalScore, finalLevel)
        .then(() => fetchRemoteLeaderboard(dailyId).catch(() => {}))
        .catch(() => {});

      showToast(finalState === "win" ? "Saved to leaderboard 🏆" : "Score saved 🏆", 1200);
    },
    [canCommitOnce, dailyId, fetchRemoteLeaderboard, practiceMode, saveLeaderboard, showToast, submitRemoteScore, userAddr]
  );

  const loseLifeOrBall = useCallback(
    (ballIndex: number) => {
      const balls = ballsRef.current;

      // remove that ball
      balls.splice(ballIndex, 1);

      if (balls.length > 0) {
        beep(180, 50, 0.03);
        haptic(15);
        return;
      }

      // no balls left -> life event
      if (practiceMode && practiceInfiniteLives) {
        resetBallsToPaddle();
        setGameState("idle");
        beep(220, 60, 0.03);
        haptic(20);
        return;
      }

      setLives((prev) => {
        const next = prev - 1;
        const over = next <= 0;
        setGameState(over ? "gameover" : "idle");
        if (over) maybeUpdateDailyBest(scoreRef.current);
        return next;
      });

      resetBallsToPaddle();
      beep(180, 80, 0.05);
      haptic(40);
    },
    [beep, haptic, maybeUpdateDailyBest, practiceInfiniteLives, practiceMode, resetBallsToPaddle]
  );

  const spawnDropMaybe = useCallback(
    (x: number, y: number) => {
      const r = Math.random();
      const chance = practiceMode ? 0.12 : 0.06;
      if (r > chance) return;

      const pick = Math.random();
      const type: PowerUpType = pick < 0.34 ? "widen" : pick < 0.67 ? "slow" : "multiball";

      dropsRef.current.push({
        x,
        y,
        vy: 110,
        size: 12,
        type,
        alive: true,
      });
    },
    [practiceMode]
  );

  const applyPowerUp = useCallback(
    (type: PowerUpType) => {
      const now = performance.now();
      if (type === "widen") {
        widenUntilRef.current = now + 12000;
        showToast("🎁 Widen Paddle!", 900);
        beep(780, 40, 0.02);
        haptic(20);
      } else if (type === "slow") {
        slowUntilRef.current = now + 9000;
        showToast("🎁 Slow Ball!", 900);
        beep(640, 40, 0.02);
        haptic(20);
      } else if (type === "multiball") {
        const balls = ballsRef.current;
        if (balls.length >= 4) {
          showToast("🎁 Multiball (max)", 900);
          return;
        }
        const base =
          balls[0] ?? { x: paddleRef.current.x, y: paddleRef.current.y - 20, r: 7, vx: 0, vy: 0, launched: false };
        const speed = baseBallSpeed();

        const mkBall = (dir: number): Ball => ({
          x: base.x,
          y: base.y,
          r: 7,
          vx: dir * (0.35 * speed),
          vy: -Math.sqrt(Math.max(0, speed * speed - (0.35 * speed) * (0.35 * speed))),
          launched: true,
        });

        balls.push(mkBall(1), mkBall(-1));
        showToast("🎁 Multi-ball!", 900);
        beep(920, 55, 0.02);
        haptic(30);
      }
    },
    [baseBallSpeed, beep, haptic, showToast]
  );

  async function shareScore() {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/brick-breaker`;

    const modeLine = practiceMode ? `🧪 Practice Mode` : `🎯 Daily Mode`;
    const attemptsLine = practiceMode
      ? `Attempts: ∞`
      : attemptsLeft <= 0
        ? `⚠️ Out of attempts today`
        : `Attempts: ${attemptsLeft}/${DAILY_ATTEMPTS}`;
    const statusLine =
      gameState === "win"
        ? `✅ Cleared Level ${level}!`
        : gameState === "gameover"
          ? `💥 Game Over`
          : gameState === "paused"
            ? `⏸ Paused`
            : `🎮 In progress`;

    const text =
      `🧱 Brick Breaker — Daily Challenge (${dailyId})\n` +
      `${modeLine}\n` +
      `${statusLine}\n` +
      `Score: ${score} • Best: ${todayBest} • Streak: ${streak}🔥 • Level: ${level}\n` +
      `${attemptsLine}\n` +
      `Play: ${url}\n` +
      `#Base #Onchain #MiniApp`;

    try {
      if (typeof navigator !== "undefined" && "share" in navigator) {
        const shareFn = (navigator as Navigator & { share?: (data: { text?: string }) => Promise<void> }).share;
        if (shareFn) {
          await shareFn({ text });
          showToast("Shared ✅", 1200);
          return;
        }
      }
    } catch {}

    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied ✅", 1200);
    } catch {
      showToast("Copy failed ❌", 1400);
    }
  }

  // pointer controls
  useEffect(() => {
    const maybeCanvas = canvasRef.current;
    if (!maybeCanvas) return;
    const canvasEl: HTMLCanvasElement = maybeCanvas;

    function toGameX(clientX: number) {
      const rect = canvasEl.getBoundingClientRect();
      return (clientX - rect.left) / scale;
    }

    function onDown(e: PointerEvent) {
      pointerDownRef.current = true;
      canvasEl.setPointerCapture(e.pointerId);

      const gx = toGameX(e.clientX);
      const p = paddleRef.current;
      p.targetX = clamp(gx, p.w / 2 + ui.wall, GAME_W - p.w / 2 - ui.wall);

      const gs = gameStateRef.current;
      if (gs === "idle") launchBalls();
      else if (gs === "paused") {
        setGameState("running");
        haptic(10);
        beep(360, 40, 0.02);
      } else if (gs === "win") nextLevelFn();
      else if (gs === "gameover") resetGame(1);
    }

    function onMove(e: PointerEvent) {
      if (!pointerDownRef.current) return;
      const gx = toGameX(e.clientX);
      const p = paddleRef.current;
      p.targetX = clamp(gx, p.w / 2 + ui.wall, GAME_W - p.w / 2 - ui.wall);
    }

    function onUp(e: PointerEvent) {
      pointerDownRef.current = false;
      try {
        canvasEl.releasePointerCapture(e.pointerId);
      } catch {}
    }

    canvasEl.addEventListener("pointerdown", onDown, { passive: true });
    canvasEl.addEventListener("pointermove", onMove, { passive: true });
    canvasEl.addEventListener("pointerup", onUp);
    canvasEl.addEventListener("pointercancel", onUp);

    return () => {
      canvasEl.removeEventListener("pointerdown", onDown);
      canvasEl.removeEventListener("pointermove", onMove);
      canvasEl.removeEventListener("pointerup", onUp);
      canvasEl.removeEventListener("pointercancel", onUp);
    };
  }, [beep, haptic, launchBalls, nextLevelFn, resetGame, scale, ui.wall]);

  // Commit leaderboard on gameover once (daily only)
  const lastCommittedStateRef = useRef<GameState>("idle");
  useEffect(() => {
    const prev = lastCommittedStateRef.current;
    lastCommittedStateRef.current = gameState;
    if (practiceMode) return;
    if (gameState === "gameover" && prev !== "gameover") {
      commitLeaderboardIfNeeded("gameover");
    }
  }, [commitLeaderboardIfNeeded, gameState, practiceMode]);

  // draw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const c = ctx;

    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    canvas.width = Math.floor(GAME_W * scale * dpr);
    canvas.height = Math.floor(GAME_H * scale * dpr);
    canvas.style.width = `${GAME_W * scale}px`;
    canvas.style.height = `${GAME_H * scale}px`;
    c.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);

    function stepParticles(dt: number) {
      const parts = particlesRef.current;
      if (!parts.length) return;

      const g = 420;
      for (const p of parts) {
        p.vy += g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;

        if (p.x < ui.wall) {
          p.x = ui.wall;
          p.vx *= -0.7;
        } else if (p.x > GAME_W - ui.wall) {
          p.x = GAME_W - ui.wall;
          p.vx *= -0.7;
        }
      }
      particlesRef.current = parts.filter((p) => p.life > 0 && p.y < GAME_H + 40);
    }

    function stepDrops(dt: number) {
      const drops = dropsRef.current;
      if (!drops.length) return;

      const p = paddleRef.current;
      const paddleX = p.x - p.w / 2;
      const paddleY = p.y;

      for (const d of drops) {
        if (!d.alive) continue;
        d.y += d.vy * dt;

        if (circleRectCollide(d.x, d.y, d.size, paddleX, paddleY, p.w, p.h)) {
          d.alive = false;
          applyPowerUp(d.type);
        }

        if (d.y > GAME_H + 30) d.alive = false;
      }

      dropsRef.current = drops.filter((d) => d.alive);
    }

    function drawBrick(br: Brick, shimmer: number) {
      const base = br.hp >= 2 ? "rgba(120, 200, 255, 0.95)" : "rgba(80, 170, 255, 0.88)";
      c.fillStyle = base;
      c.fillRect(br.x, br.y, br.w, br.h);

      c.fillStyle = "rgba(255,255,255,0.14)";
      c.fillRect(br.x, br.y, br.w, 3);

      if (br.hp >= 2) {
        const sweepX = br.x + ((shimmer % 1) * (br.w + 20)) - 20;
        c.fillStyle = "rgba(255,255,255,0.10)";
        c.fillRect(sweepX, br.y, 14, br.h);
      }

      c.strokeStyle = "rgba(255,255,255,0.08)";
      c.strokeRect(br.x + 0.5, br.y + 0.5, br.w - 1, br.h - 1);
    }

    function drawDrop(d: Drop) {
      c.beginPath();
      c.arc(d.x, d.y, d.size, 0, Math.PI * 2);
      c.fillStyle =
        d.type === "widen"
          ? "rgba(255,255,255,0.85)"
          : d.type === "slow"
            ? "rgba(255, 209, 102, 0.90)"
            : "rgba(80,255,160,0.90)";
      c.fill();
      c.fillStyle = "rgba(0,0,0,0.55)";
      c.font = "700 10px system-ui";
      const t = d.type === "widen" ? "W" : d.type === "slow" ? "S" : "M";
      c.fillText(t, d.x - 3.5, d.y + 3.5);
    }

    function stepGame(dt: number) {
      const p = paddleRef.current;

      const now = performance.now();
      const widened = now < widenUntilRef.current;
      p.w = widened ? 130 : 92;

      const follow = pointerDownRef.current ? 0.32 : 0.22;
      p.x = lerp(p.x, p.targetX, 1 - Math.pow(1 - follow, dt * 60));
      p.x = clamp(p.x, p.w / 2 + ui.wall, GAME_W - p.w / 2 - ui.wall);

      const balls = ballsRef.current;

      if (!balls.some((b) => b.launched)) {
        for (const b of balls) {
          b.x = p.x;
          b.y = p.y - 20;
        }
        return;
      }

      const speedScale = now < slowUntilRef.current ? 0.78 : 1.0;

      for (let i = balls.length - 1; i >= 0; i--) {
        const b = balls[i];
        if (!b.launched) continue;

        b.x += b.vx * dt * speedScale;
        b.y += b.vy * dt * speedScale;

        if (b.x - b.r < ui.wall) {
          b.x = ui.wall + b.r;
          b.vx *= -1;
        }
        if (b.x + b.r > GAME_W - ui.wall) {
          b.x = GAME_W - ui.wall - b.r;
          b.vx *= -1;
        }
        if (b.y - b.r < ui.headerH) {
          b.y = ui.headerH + b.r;
          b.vy *= -1;
        }

        if (b.y - b.r > GAME_H) {
          loseLifeOrBall(i);
          continue;
        }

        const paddleX = p.x - p.w / 2;
        const paddleY = p.y;
        if (b.vy > 0 && circleRectCollide(b.x, b.y, b.r, paddleX, paddleY, p.w, p.h)) {
          b.y = paddleY - b.r;

          const hit = (b.x - p.x) / (p.w / 2);
          const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
          const maxAngle = (65 * Math.PI) / 180;
          const angle = hit * maxAngle;

          b.vx = speed * Math.sin(angle);
          b.vy = -Math.abs(speed * Math.cos(angle));

          haptic(8);
          beep(520, 25, 0.015);
        }

        let brokeBrick = false;
        for (const br of bricksRef.current) {
          if (!br.alive) continue;
          if (circleRectCollide(b.x, b.y, b.r, br.x, br.y, br.w, br.h)) {
            br.hp -= 1;
            if (br.hp <= 0) {
              br.alive = false;
              setScore((s) => s + 10);
              brokeBrick = true;
              spawnDropMaybe(br.x + br.w / 2, br.y + br.h / 2);
            }

            const centerX = br.x + br.w / 2;
            const centerY = br.y + br.h / 2;
            const dx = (b.x - centerX) / (br.w / 2);
            const dy = (b.y - centerY) / (br.h / 2);

            if (Math.abs(dx) > Math.abs(dy)) b.vx *= -1;
            else b.vy *= -1;

            break;
          }
        }

        if (brokeBrick) {
          haptic(12);
          beep(720, 18, 0.02);
        }
      }

      if (!bricksRef.current.some((br) => br.alive)) {
        const finalScore = scoreRef.current;
        maybeUpdateDailyBest(finalScore);
        setGameState("win");

        resetBallsToPaddle();
        spawnWinParticles();

        haptic(60);
        beep(880, 80, 0.03);
        beep(660, 90, 0.02);

        commitLeaderboardIfNeeded("win");
      }
    }

    function draw() {
      c.clearRect(0, 0, GAME_W, GAME_H);

      c.fillStyle = "#0b0f1a";
      c.fillRect(0, 0, GAME_W, ui.headerH);

      c.fillStyle = "#e8eefc";
      c.font = "600 14px system-ui, -apple-system, Segoe UI, Roboto";
      c.fillText(`Score: ${score}`, 12, 28);
      c.fillText(`Lives: ${practiceMode && practiceInfiniteLives ? "∞" : lives}`, 140, 28);
      c.fillText(`Lv: ${level}`, 280, 28);

      const shimmer = shimmerTRef.current;

      for (const br of bricksRef.current) {
        if (!br.alive) continue;
        drawBrick(br, shimmer);
      }

      for (const d of dropsRef.current) {
        if (!d.alive) continue;
        drawDrop(d);
      }

      for (const p of particlesRef.current) {
        c.beginPath();
        c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        c.fillStyle = "rgba(255,255,255,0.85)";
        c.fill();
      }

      const p = paddleRef.current;
      c.fillStyle = "rgba(255, 255, 255, 0.92)";
      c.fillRect(p.x - p.w / 2, p.y, p.w, p.h);

      for (const b of ballsRef.current) {
        c.beginPath();
        c.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        c.fillStyle = "#ffd166";
        c.fill();
      }

      if (gameState === "idle") {
        c.fillStyle = "rgba(255,255,255,0.92)";
        c.font = "700 18px system-ui";
        const canPlay = practiceMode || attemptsLeft > 0;
        c.fillText(canPlay ? "Tap to launch" : "No attempts left", 98, 300);

        c.fillStyle = "rgba(255,255,255,0.70)";
        c.font = "600 13px system-ui";
        if (!practiceMode && attemptsLeft <= 0) c.fillText("Come back tomorrow 👋", 105, 323);
        if (practiceMode) c.fillText("Practice mode (no daily impact)", 78, 323);
      }

      if (gameState === "paused") {
        c.fillStyle = "rgba(255,255,255,0.92)";
        c.font = "800 22px system-ui";
        c.fillText("PAUSED", 135, 290);

        c.fillStyle = "rgba(255,255,255,0.70)";
        c.font = "600 13px system-ui";
        c.fillText("Tap canvas or press Resume", 86, 315);
      }

      if (gameState === "gameover") {
        c.fillStyle = "rgba(255,80,80,0.95)";
        c.font = "800 22px system-ui";
        c.fillText("GAME OVER", 115, 290);

        c.fillStyle = "rgba(255,255,255,0.70)";
        c.font = "600 13px system-ui";
        c.fillText("Press Restart to try again", 98, 315);
      }

      if (gameState === "win") {
        c.fillStyle = "rgba(80,255,160,0.95)";
        c.font = "800 22px system-ui";
        c.fillText("LEVEL CLEARED!", 92, 290);

        c.fillStyle = "rgba(255,255,255,0.70)";
        c.font = "600 13px system-ui";
        c.fillText("Tap to continue", 128, 315);
      }
    }

    function loop(t: number) {
      const last = lastTRef.current || t;
      let dt = (t - last) / 1000;
      lastTRef.current = t;
      dt = Math.min(dt, 0.033);

      shimmerTRef.current += dt * 0.9;

      if (gameState === "running") stepGame(dt);
      stepDrops(dt);
      stepParticles(dt);
      draw();

      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [
    applyPowerUp,
    attemptsLeft,
    beep,
    commitLeaderboardIfNeeded,
    gameState,
    haptic,
    level,
    lives,
    loseLifeOrBall,
    maybeUpdateDailyBest,
    practiceInfiniteLives,
    practiceMode,
    resetBallsToPaddle,
    score,
    scale,
    spawnDropMaybe,
    spawnWinParticles,
    ui.headerH,
    ui.wall,
  ]);

  const renderPillButton = (label: string, onClick: () => void) => (
    <button
      onClick={onClick}
      className="px-2 py-0.5 rounded-xl bg-white/10 border border-white/15 text-[11px] text-white/80 active:scale-[0.99]"
      type="button"
    >
      {label}
    </button>
  );

  const shareLabel =
    gameState === "win"
      ? "Share Win"
      : gameState === "gameover"
        ? "Share Score"
        : attemptsLeft <= 0 && !practiceMode
          ? "Share (0 attempts)"
          : "Share";

  const boardToShow = remoteLb.length ? remoteLb : lb;
  const boardLabel = remoteLb.length ? "Remote" : "Local";

  return (
    <div ref={containerRef} className="min-h-[100dvh] bg-black text-white w-full max-w-[520px] mx-auto px-3 py-4">
      <div className="mb-3 flex items-center gap-2 relative z-20">

        <Link
          href="/"
          className="h-10 px-3 rounded-2xl bg-white/10 text-white font-semibold border border-white/15 inline-flex items-center active:scale-[0.99]"
        >
          ←
        </Link>

        <div className="flex-1">
          <div className="text-sm font-semibold leading-tight">Brick Breaker</div>

          <div className="mt-1 inline-flex items-center gap-2 text-[11px] text-white/70 flex-wrap">
            <span className="px-2 py-0.5 rounded-xl bg-white/10 border border-white/15">Daily {dailyId}</span>
            <span className="px-2 py-0.5 rounded-xl bg-white/10 border border-white/15">Best {todayBest}</span>
            <span className="px-2 py-0.5 rounded-xl bg-white/10 border border-white/15">🔥 Streak {streak}</span>
            <span className="px-2 py-0.5 rounded-xl bg-white/10 border border-white/15">
              🎟 Attempts {practiceMode || DAILY_ATTEMPTS === Infinity ? "∞" : `${attemptsLeft}/${DAILY_ATTEMPTS}`}
            </span>

            {renderPillButton(practiceMode ? "🧪 Practice" : "🎯 Daily", () => {
              setPracticeMode((v) => {
                const next = !v;
                showToast(next ? "Practice mode 🧪 (no daily impact)" : "Daily mode 🎯", 1200);
                haptic(20);
                beep(next ? 500 : 700, 40, 0.02);

                setPracticeInfiniteLives(false);
                setScore(0);
                setLives(3);
                setLevel(1);
                makeLevelBricks(1);
                resetRound();
                setGameState("idle");
                particlesRef.current = [];
                lastCommitKeyRef.current = "";
                return next;
              });
            })}

            {practiceMode &&
              renderPillButton(practiceInfiniteLives ? "❤️∞ Lives" : "❤️ Lives", () => {
                setPracticeInfiniteLives((v) => {
                  const next = !v;
                  showToast(next ? "Infinite lives enabled ❤️∞" : "Infinite lives off ❤️", 1100);
                  haptic(15);
                  beep(next ? 860 : 420, 35, 0.02);
                  return next;
                });
              })}

            {renderPillButton(soundOn ? "🔊 Sound ON" : "🔇 Sound OFF", () => {
              setSoundOn((v) => {
                const next = !v;
                if (next) {
                  ensureAudio();
                  showToast("Sound enabled 🔊", 1000);
                  beep(600, 50, 0.02);
                } else {
                  showToast("Sound muted 🔇", 1000);
                }
                return next;
              });
            })}

            {renderPillButton(hapticsOn ? "📳 Haptics ON" : "📴 Haptics OFF", () => {
              setHapticsOn((v) => {
                const next = !v;
                showToast(next ? "Haptics enabled 📳" : "Haptics off 📴", 1000);
                if (next) haptic(20);
                return next;
              });
            })}

            <button
  type="button"
  onClick={() => setLbOpen(true)}
  className="px-3 py-1 rounded-xl bg-white/15 border border-white/20 text-[11px] text-white/90 font-semibold cursor-pointer pointer-events-auto active:scale-[0.99]"
>
  🏆 Leaderboard
</button>

          </div>
        </div>

        <div className="h-10 px-3 rounded-2xl bg-white/10 border border-white/15 flex items-center">
          <span className="text-[11px] text-white/60 mr-2">Score</span>
          <span className="text-sm font-extrabold tabular-nums">{score}</span>
        </div>
      </div>

      <div className="rounded-3xl overflow-hidden border border-white/10 bg-white/5 shadow-[0_0_0_1px_rgba(255,255,255,0.05)] relative z-0">
  <canvas ref={canvasRef} className="block touch-none select-none" />
</div>


      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => {
            if (gameState === "idle" && attemptsLeft <= 0 && !practiceMode) {
              showToast("No attempts left today ❌");
              haptic(40);
              beep(220, 60, 0.05);
              return;
            }
            if (gameState === "idle") return launchBalls();
            if (gameState === "running") return setGameState("paused");
            if (gameState === "paused") return setGameState("running");
            if (gameState === "gameover") return resetGame(1);
            if (gameState === "win") return nextLevelFn();
          }}
          className={`h-11 px-4 rounded-2xl font-extrabold active:scale-[0.99] ${
            gameState === "idle" && attemptsLeft <= 0 && !practiceMode
              ? "bg-white/10 text-white/40 border border-white/10 cursor-not-allowed"
              : "bg-white text-black"
          }`}
        >
          {gameState === "idle" && (attemptsLeft <= 0 && !practiceMode ? "No Attempts" : "Start")}
          {gameState === "running" && "Pause"}
          {gameState === "paused" && "Resume"}
          {gameState === "gameover" && "Restart"}
          {gameState === "win" && "Next Level"}
        </button>

        <button
          onClick={() => resetGame(1)}
          className="h-11 px-4 rounded-2xl bg-white/10 text-white font-semibold border border-white/15 active:scale-[0.99]"
        >
          Reset
        </button>

        <button
          onClick={shareScore}
          className="h-11 px-4 rounded-2xl bg-white/10 text-white font-semibold border border-white/15 active:scale-[0.99]"
        >
          {shareLabel}
        </button>

        <div className="ml-auto text-xs text-white/70">
          {practiceMode
            ? "Practice • Drag to move • Tap to launch"
            : attemptsLeft > 0
              ? "Drag to move • Tap to launch"
              : "No attempts left today"}
        </div>
      </div>

      {lbOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-3">
          <div className="w-full max-w-[520px] rounded-3xl border border-white/10 bg-[#0b0f1a] shadow-xl overflow-hidden">
            <div className="p-4 flex items-center gap-2 border-b border-white/10">
              <div className="font-extrabold">🏆 Daily Leaderboard</div>
              <div className="ml-auto text-xs text-white/60">{dailyId}</div>

              <button
                onClick={() => fetchRemoteLeaderboard(dailyId).catch(() => {})}
                className="ml-2 h-9 px-3 rounded-2xl bg-white/10 border border-white/15 text-white/80 font-semibold active:scale-[0.99]"
              >
                Refresh
              </button>

              <button
                onClick={() => setLbOpen(false)}
                className="ml-2 h-9 px-3 rounded-2xl bg-white/10 border border-white/15 text-white/80 font-semibold active:scale-[0.99]"
              >
                Close
              </button>
            </div>

            <div className="p-4">
              {remoteLbErr && (
                <div className="mb-3 text-[12px] text-red-300 bg-white/5 border border-white/10 rounded-2xl px-3 py-2">
                  Remote error: {remoteLbErr}
                </div>
              )}

              {boardToShow.length === 0 ? (
                <div className="text-sm text-white/70">No scores yet. Finish a daily run to appear here.</div>
              ) : (
                <div className="space-y-2">
                  {boardToShow.map((e, idx) => (
                    <div
                      key={`${e.t}-${idx}`}
                      className="flex items-center gap-3 px-3 py-2 rounded-2xl bg-white/5 border border-white/10"
                    >
                      <div className="w-6 text-white/70 font-extrabold tabular-nums">{idx + 1}</div>
                      <div className="flex-1">
                        <div className="text-sm font-semibold">{e.name}</div>
                        <div className="text-[11px] text-white/60">Level {e.level}</div>
                      </div>
                      <div className="text-sm font-extrabold tabular-nums">{e.score}</div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 text-[11px] text-white/50">
                * Showing: {boardLabel}. Practice mode doesn’t submit remotely.
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed left-0 right-0 bottom-5 flex justify-center pointer-events-none z-50">
          <div className="px-3 py-2 rounded-2xl bg-black/80 border border-white/10 text-white text-sm shadow">
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}
