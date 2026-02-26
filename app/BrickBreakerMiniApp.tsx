"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * BrickBreakerMiniApp.tsx — Phase-2 Architecture (single-file, NO MINT)
 * ✅ Hydration-safe
 * ✅ No explicit any (ESLint TS strict OK)
 * ✅ Stable callbacks (hooks deps OK)
 */

const DAILY_ATTEMPTS = 3;
const MAX_LEVEL = 30;
const BOSS_EVERY = 5;

const POWERUP_DROP_CHANCE = 0.22;
const POWERUP_FALL_SPEED = 2.3;

const EFFECT_WIDE_MS = 10_000;
const EFFECT_SLOW_MS = 7_000;
const EFFECT_FIRE_MS = 8_000;
const EFFECT_MAGNET_MS = 7_000;

const STORAGE_ATTEMPTS = "bb.p2.dailyAttempts.v1";
const STORAGE_PROFILE = "bb.p2.profile.v1";
const STORAGE_WEEKLY = "bb.p2.weekly.v1";
const STORAGE_MUTED = "bb.p2.muted.v1";

/* =======================
   TYPES
   ======================= */
type GameState = "idle" | "running" | "paused" | "gameover" | "win";

type Brick = {
  x: number;
  y: number;
  w: number;
  h: number;
  alive: boolean;
  hp: number;
  hue: number;
  isBoss?: boolean;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  hue: number;
};

type FloatText = {
  x: number;
  y: number;
  vy: number;
  life: number;
  max: number;
  text: string;
};

type PowerUpType = "wide" | "slow" | "fire" | "magnet";
type PowerUp = {
  id: string;
  type: PowerUpType;
  x: number;
  y: number;
  r: number;
  vy: number;
};

type SkinId = "neon" | "plasma" | "gold" | "mint";

type Profile = {
  playerId: string;
  xp: number;
  playerLevel: number;
  bestScoreAllTime: number;
  streakDays: number;
  lastPlayDateKey: string;
  unlockedSkins: SkinId[];
  selectedSkin: SkinId;
};

type WeeklyEntry = { playerId: string; name: string; score: number; ts: number };
type WeeklyState = { weekKey: string; top: WeeklyEntry[] };

type Challenge = { active: boolean; targetScore: number; targetLevel: number; weekKey: string };

/* =======================
   TIME HELPERS (Europe/Istanbul)
   ======================= */
function getIstanbulParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
    hh: Number(get("hour")),
    mm: Number(get("minute")),
    ss: Number(get("second")),
  };
}

function getIstanbulDateKey() {
  const { y, m, d } = getIstanbulParts();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${y}-${pad(m)}-${pad(d)}`;
}

function secondsUntilNextIstanbulMidnight() {
  const { y, m, d, hh, mm, ss } = getIstanbulParts();
  const IST_OFFSET_MIN = 180; // TR is UTC+3
  const nowISTasUTC = Date.UTC(y, m - 1, d, hh, mm, ss) - IST_OFFSET_MIN * 60_000;
  const nextMid = Date.UTC(y, m - 1, d + 1, 0, 0, 0) - IST_OFFSET_MIN * 60_000;
  return Math.max(0, Math.floor((nextMid - nowISTasUTC) / 1000));
}

function formatHMS(totalSec: number) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function getIstanbulWeekKey(): string {
  const { y, m, d } = getIstanbulParts();
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const tmp = new Date(date.getTime());
  tmp.setUTCDate(tmp.getUTCDate() + 3 - ((tmp.getUTCDay() + 6) % 7));
  const week1 = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 4));
  const weekNo =
    1 +
    Math.round(
      ((tmp.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getUTCDay() + 6) % 7)) / 7
    );
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/* =======================
   UTILS
   ======================= */
function safeJsonParse<T>(raw: string | null, fallback: T): T {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function uid() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

function isBossLevel(lv: number) {
  return lv > 0 && lv % BOSS_EVERY === 0;
}

/* =======================
   XP CURVE
   ======================= */
function xpNeededForLevel(level: number) {
  return Math.floor(120 + (level - 1) * 90 + Math.pow(level - 1, 1.3) * 55);
}
function computePlayerLevel(xp: number) {
  let lvl = 1;
  let remaining = xp;
  while (lvl < 60) {
    const need = xpNeededForLevel(lvl);
    if (remaining < need) break;
    remaining -= need;
    lvl += 1;
  }
  return lvl;
}

/* =======================
   SKINS
   ======================= */
const SKINS: Record<
  SkinId,
  {
    name: string;
    unlockLevel: number;
    vars: { a: string; b: string; c: string; glow: string };
  }
> = {
  neon: {
    name: "Neon",
    unlockLevel: 1,
    vars: { a: "#22d3ee", b: "#8b5cf6", c: "#3b82f6", glow: "rgba(34,211,238,0.25)" },
  },
  plasma: {
    name: "Plasma",
    unlockLevel: 4,
    vars: { a: "#a78bfa", b: "#22d3ee", c: "#60a5fa", glow: "rgba(167,139,250,0.28)" },
  },
  gold: {
    name: "Gold",
    unlockLevel: 8,
    vars: { a: "#f59e0b", b: "#fde68a", c: "#f97316", glow: "rgba(245,158,11,0.25)" },
  },
  mint: {
    name: "Mint",
    unlockLevel: 12,
    vars: { a: "#34d399", b: "#22d3ee", c: "#a7f3d0", glow: "rgba(52,211,153,0.22)" },
  },
};

const POWER_ICON: Record<PowerUpType, string> = { wide: "🟦", slow: "🧊", fire: "🔥", magnet: "🧲" };

/* =======================
   PHASE-2 ADAPTERS
   ======================= */
interface AnalyticsAdapter {
  track(event: string, props?: Record<string, unknown>): void;
}
class ConsoleAnalytics implements AnalyticsAdapter {
  track(_event: string, _props?: Record<string, unknown>) {
    // no-op in prod; avoid console lint issues
  }
}

interface LeaderboardAdapter {
  getWeekly(weekKey: string): WeeklyState;
  submitWeekly(weekKey: string, entry: WeeklyEntry): WeeklyState;
}
class LocalLeaderboard implements LeaderboardAdapter {
  getWeekly(weekKey: string): WeeklyState {
    const w = safeJsonParse<WeeklyState | null>(localStorage.getItem(STORAGE_WEEKLY), null);
    if (!w || w.weekKey !== weekKey) {
      const nw: WeeklyState = { weekKey, top: [] };
      localStorage.setItem(STORAGE_WEEKLY, JSON.stringify(nw));
      return nw;
    }
    return w;
  }
  submitWeekly(weekKey: string, entry: WeeklyEntry): WeeklyState {
    const base = this.getWeekly(weekKey);
    const filtered = base.top.filter((e) => e.playerId !== entry.playerId);
    const merged = [...filtered, entry].sort((a, b) => b.score - a.score).slice(0, 10);
    const next: WeeklyState = { weekKey, top: merged };
    localStorage.setItem(STORAGE_WEEKLY, JSON.stringify(next));
    return next;
  }
}

interface RewardsAdapter {
  applyDailyReward(
    profile: Profile,
    attemptsLeft: number,
    practice: boolean
  ): { profile: Profile; attemptsLeft: number; message: string | null };
  awardXp(profile: Profile, amount: number): Profile;
  unlockSkins(profile: Profile): Profile;
}
class DefaultRewards implements RewardsAdapter {
  applyDailyReward(profile: Profile, attemptsLeft: number, practice: boolean) {
    const today = getIstanbulDateKey();
    if (profile.lastPlayDateKey === today) return { profile, attemptsLeft, message: null };

    const prev = profile.lastPlayDateKey;
    let newStreak = 1;
    if (prev) {
      const { y, m, d } = getIstanbulParts();
      const pad = (n: number) => String(n).padStart(2, "0");
      const yesterday = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const yesterdayKey = `${yesterday.getUTCFullYear()}-${pad(
        yesterday.getUTCMonth() + 1
      )}-${pad(yesterday.getUTCDate())}`;
      newStreak = prev === yesterdayKey ? (profile.streakDays || 0) + 1 : 1;
    }

    const bonusXp = 60 + Math.min(140, newStreak * 12);
    const giveLife = newStreak % 3 === 0;

    let next: Profile = { ...profile, streakDays: newStreak, lastPlayDateKey: today };
    next = this.awardXp(next, bonusXp);
    next = this.unlockSkins(next);

    let nextAttempts = attemptsLeft;
    if (giveLife && !practice) {
      nextAttempts = clamp(attemptsLeft + 1, 0, DAILY_ATTEMPTS + 1);
      try {
        localStorage.setItem(STORAGE_ATTEMPTS, JSON.stringify({ dateKey: today, left: nextAttempts }));
      } catch {}
      return {
        profile: next,
        attemptsLeft: nextAttempts,
        message: `Daily reward: +${bonusXp} XP & +1 life (Streak ${newStreak})`,
      };
    }
    return { profile: next, attemptsLeft: nextAttempts, message: `Daily reward: +${bonusXp} XP (Streak ${newStreak})` };
  }

  awardXp(profile: Profile, amount: number) {
    const xp = profile.xp + amount;
    const lvl = computePlayerLevel(xp);
    return { ...profile, xp, playerLevel: lvl };
  }

  unlockSkins(profile: Profile) {
    const unlocks = new Set<SkinId>(profile.unlockedSkins ?? ["neon"]);
    (Object.keys(SKINS) as SkinId[]).forEach((sid) => {
      if (profile.playerLevel >= SKINS[sid].unlockLevel) unlocks.add(sid);
    });
    const selected = unlocks.has(profile.selectedSkin) ? profile.selectedSkin : "neon";
    return { ...profile, unlockedSkins: Array.from(unlocks), selectedSkin: selected };
  }
}

/* =======================
   STORE
   ======================= */
class StorageStore {
  loadMuted(): boolean {
    return localStorage.getItem(STORAGE_MUTED) === "1";
  }
  saveMuted(m: boolean) {
    localStorage.setItem(STORAGE_MUTED, m ? "1" : "0");
  }

  loadAttempts(): { dateKey: string; left: number } {
    const today = getIstanbulDateKey();
    const raw = safeJsonParse<{ dateKey?: string; left?: number }>(localStorage.getItem(STORAGE_ATTEMPTS), {});
    if (raw.dateKey === today && typeof raw.left === "number")
      return { dateKey: today, left: clamp(raw.left, 0, DAILY_ATTEMPTS + 1) };
    const next = { dateKey: today, left: DAILY_ATTEMPTS };
    localStorage.setItem(STORAGE_ATTEMPTS, JSON.stringify(next));
    return next;
  }
  saveAttempts(dateKey: string, left: number) {
    localStorage.setItem(STORAGE_ATTEMPTS, JSON.stringify({ dateKey, left }));
  }

  loadProfile(): Profile {
    const p = safeJsonParse<Profile | null>(localStorage.getItem(STORAGE_PROFILE), null);
    if (!p) {
      const np: Profile = {
        playerId: uid(),
        xp: 0,
        playerLevel: 1,
        bestScoreAllTime: 0,
        streakDays: 0,
        lastPlayDateKey: "",
        unlockedSkins: ["neon"],
        selectedSkin: "neon",
      };
      localStorage.setItem(STORAGE_PROFILE, JSON.stringify(np));
      return np;
    }
    const lvl = computePlayerLevel(p.xp);
    let fixed: Profile = { ...p, playerLevel: lvl };
    const unlocks = new Set<SkinId>(fixed.unlockedSkins ?? ["neon"]);
    (Object.keys(SKINS) as SkinId[]).forEach((sid) => {
      if (lvl >= SKINS[sid].unlockLevel) unlocks.add(sid);
    });
    fixed = {
      ...fixed,
      unlockedSkins: Array.from(unlocks),
      selectedSkin: unlocks.has(fixed.selectedSkin) ? fixed.selectedSkin : "neon",
    };
    localStorage.setItem(STORAGE_PROFILE, JSON.stringify(fixed));
    return fixed;
  }
  saveProfile(p: Profile) {
    localStorage.setItem(STORAGE_PROFILE, JSON.stringify(p));
  }
}

/* =======================
   ENGINE
   ======================= */
type EngineEvents =
  | { type: "score"; score: number }
  | { type: "state"; state: GameState }
  | { type: "toast"; message: string }
  | { type: "win"; score: number; level: number; perfect: boolean; boss: boolean }
  | { type: "lose"; score: number; level: number };

type EngineCallbacks = (e: EngineEvents) => void;

class GameEngine {
  canvas: HTMLCanvasElement | null = null;
  ctx: CanvasRenderingContext2D | null = null;

  dpr = 1;
  cw = 420;
  ch = 640;

  input = { left: false, right: false, pointerActive: false };

  state: GameState = "idle";
  level = 1;
  score = 0;

  perfectEligible = true;

  trail: { x: number; y: number; a: number }[] = [];
  particles: Particle[] = [];
  floatTexts: FloatText[] = [];
  shake = 0;
  shakeDecay = 0.88;

  paddleX = 0;
  paddleY = 0;
  paddleW = 96;
  paddleH = 14;
  paddleSpeed = 7;

  ballX = 0;
  ballY = 0;
  ballR = 7;
  ballVX = 3.2;
  ballVY = -4.6;

  bricks: Brick[] = [];
  bricksRemaining = 0;
  totalBricks = 0;

  combo = 0;
  lastHitAt = 0;

  speedMul = 1;

  powerUps: PowerUp[] = [];
  slowMul = 1;
  effectUntil = { wide: 0, slow: 0, fire: 0, magnet: 0 };
  fireball = false;
  magnet = false;
  stuckToPaddle = false;

  almostModeUntil = 0;

  skin = SKINS.neon.vars;

  sfx = {
    hit: () => {},
    brick: () => {},
    power: () => {},
    lose: () => {},
    win: () => {},
  };

  onEvent: EngineCallbacks;

  constructor(onEvent: EngineCallbacks) {
    this.onEvent = onEvent;
  }

  bindCanvas(canvas: HTMLCanvasElement, dpr: number, cw: number, ch: number) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.dpr = dpr;
    this.cw = cw;
    this.ch = ch;
    this.paddleY = ch - 44;
  }

  setSkin(vars: typeof SKINS.neon.vars) {
    this.skin = vars;
  }

  setLevel(lv: number) {
    this.level = clamp(lv, 1, MAX_LEVEL);
    this.perfectEligible = true;
    this.hardResetWorld(this.level);
  }

  setState(state: GameState) {
    this.state = state;
    this.onEvent({ type: "state", state });
  }

  start() {
    if (this.state === "idle") {
      this.score = 0;
      this.hardResetWorld(this.level);
    }
    this.setState("running");
  }

  togglePause() {
    if (this.state === "running") this.setState("paused");
    else if (this.state === "paused") this.setState("running");
  }

  resetToIdle() {
    this.score = 0;
    this.perfectEligible = true;
    this.hardResetWorld(this.level);
    this.setState("idle");
  }

  hardResetWorld(levelNum: number) {
    const cw = this.cw;
    const ch = this.ch;

    this.speedMul = 1 + Math.min(0.85, (levelNum - 1) * 0.1);

    this.slowMul = 1;
    this.effectUntil = { wide: 0, slow: 0, fire: 0, magnet: 0 };
    this.fireball = false;
    this.magnet = false;
    this.stuckToPaddle = false;
    this.almostModeUntil = 0;

    this.paddleW = Math.max(86, Math.floor(cw * (0.23 - Math.min(0.06, (levelNum - 1) * 0.01))));
    this.paddleH = 14;
    this.paddleX = (cw - this.paddleW) / 2;
    this.paddleY = ch - 44;
    this.paddleSpeed = Math.max(6, Math.floor(cw * 0.017));

    this.ballR = Math.max(6, Math.floor(cw * 0.016));
    this.ballX = cw / 2;
    this.ballY = ch - 72;

    const baseVX = cw * 0.008;
    const baseVY = -ch * 0.0085;
    this.ballVX = baseVX * this.speedMul;
    this.ballVY = baseVY * this.speedMul;

    this.trail = [];
    this.particles = [];
    this.floatTexts = [];
    this.shake = 0;
    this.combo = 0;
    this.lastHitAt = 0;

    this.powerUps = [];

    this.makeBricks(levelNum);
  }

  makeBricks(levelNum: number) {
    if (isBossLevel(levelNum)) {
      const bw = Math.floor(this.cw * 0.72);
      const bh = 26;
      const bx = (this.cw - bw) / 2;
      const by = 92;
      const hp = 10 + Math.floor(levelNum * 1.2);
      const hue = (280 + levelNum * 9) % 360;
      this.bricks = [{ x: bx, y: by, w: bw, h: bh, alive: true, hp, hue, isBoss: true }];
      this.bricksRemaining = 1;
      this.totalBricks = 1;
      return;
    }

    const padding = 12;
    const top = 76;
    const baseCols = 8;
    const cols = clamp(baseCols + (levelNum >= 3 ? 1 : 0), 6, 10);
    const rows = clamp(5 + (levelNum >= 2 ? 1 : 0) + (levelNum >= 7 ? 1 : 0), 4, 7);

    const gap = 8;
    const usableW = this.cw - padding * 2;
    const brickW = Math.floor((usableW - gap * (cols - 1)) / cols);
    const brickH = 18;

    const bricks: Brick[] = [];
    let aliveCount = 0;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let alive = true;
        if (levelNum === 2 && (r + c) % 5 === 0) alive = false;
        if (levelNum >= 4 && (c - r + cols) % 7 === 0) alive = false;
        if (!alive) continue;

        const hp = levelNum >= 3 && (r + c) % 4 === 0 ? 2 : 1;
        const hue = (210 + (r * 18 + c * 9) + levelNum * 13) % 360;

        bricks.push({
          x: padding + c * (brickW + gap),
          y: top + r * (brickH + gap),
          w: brickW,
          h: brickH,
          alive: true,
          hp,
          hue,
        });
        aliveCount++;
      }
    }

    this.bricks = bricks;
    this.bricksRemaining = aliveCount;
    this.totalBricks = aliveCount;
  }

  movePaddleTo(x: number) {
    const target = x - this.paddleW / 2;
    this.paddleX = clamp(target, 0, this.cw - this.paddleW);
  }

  maybeDropPowerUp(x: number, y: number) {
    if (Math.random() > POWERUP_DROP_CHANCE) return;
    const types: PowerUpType[] = ["wide", "slow", "fire", "magnet"];
    const type = types[Math.floor(Math.random() * types.length)];
    this.powerUps.push({ id: uid(), type, x, y, r: 10, vy: POWERUP_FALL_SPEED });
  }

  applyPowerUp(type: PowerUpType) {
    const now = performance.now();

    if (type === "wide") {
      this.effectUntil.wide = now + EFFECT_WIDE_MS;
      this.paddleW = Math.min(this.cw * 0.42, this.paddleW * 1.35);
      this.onEvent({ type: "toast", message: "Power-Up: Wide Paddle" });
    }
    if (type === "slow") {
      this.effectUntil.slow = now + EFFECT_SLOW_MS;
      this.slowMul = 0.72;
      this.onEvent({ type: "toast", message: "Power-Up: Slow-Mo" });
    }
    if (type === "fire") {
      this.effectUntil.fire = now + EFFECT_FIRE_MS;
      this.fireball = true;
      this.onEvent({ type: "toast", message: "Power-Up: Fireball" });
    }
    if (type === "magnet") {
      this.effectUntil.magnet = now + EFFECT_MAGNET_MS;
      this.magnet = true;
      this.onEvent({ type: "toast", message: "Power-Up: Magnet (tap to release)" });
    }
    this.sfx.power();
  }

  updateEffectsTimers() {
    const now = performance.now();
    if (this.effectUntil.wide && now > this.effectUntil.wide) {
      this.effectUntil.wide = 0;
      this.paddleW = Math.max(86, Math.floor(this.cw * 0.23));
    }
    if (this.effectUntil.slow && now > this.effectUntil.slow) {
      this.effectUntil.slow = 0;
      this.slowMul = 1;
    }
    if (this.effectUntil.fire && now > this.effectUntil.fire) {
      this.effectUntil.fire = 0;
      this.fireball = false;
    }
    if (this.effectUntil.magnet && now > this.effectUntil.magnet) {
      this.effectUntil.magnet = 0;
      this.magnet = false;
      this.stuckToPaddle = false;
    }
  }

  releaseBallFromMagnet() {
    if (!this.stuckToPaddle) return;
    this.stuckToPaddle = false;
    const t = (this.ballX - (this.paddleX + this.paddleW / 2)) / (this.paddleW / 2);
    const max = this.cw * 0.014 * this.speedMul;
    this.ballVX = clamp(this.ballVX + t * (this.cw * 0.004), -max, max);
    this.ballVY = -Math.abs(this.ballVY || this.ch * 0.008);
    this.sfx.hit();
  }

  addParticles(x: number, y: number, hue: number, power: number) {
    const n = Math.floor(10 + power * 10);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (0.8 + Math.random() * 2.2) * power;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0,
        max: 18 + Math.random() * 18,
        size: 1.2 + Math.random() * 2.2,
        hue,
      });
    }
  }

  addFloatText(x: number, y: number, text: string) {
    this.floatTexts.push({ x, y, vy: -0.7 - Math.random() * 0.5, life: 0, max: 28, text });
  }

  bumpShake(amount: number) {
    this.shake = Math.min(18, this.shake + amount);
  }

  step(ts: number) {
    if (this.state !== "running") return;

    this.updateEffectsTimers();

    // paddle keyboard
    if (!this.input.pointerActive) {
      if (this.input.left) this.paddleX -= this.paddleSpeed;
      if (this.input.right) this.paddleX += this.paddleSpeed;
      this.paddleX = clamp(this.paddleX, 0, this.cw - this.paddleW);
    }

    // magnet stick
    if (this.magnet && this.stuckToPaddle) {
      this.ballX = clamp(this.paddleX + this.paddleW / 2, this.ballR, this.cw - this.ballR);
      this.ballY = this.paddleY - this.ballR - 1;
    } else {
      this.ballX += this.ballVX * this.slowMul;
      this.ballY += this.ballVY * this.slowMul;
    }

    // trail
    this.trail.push({ x: this.ballX, y: this.ballY, a: 1 });
    if (this.trail.length > 18) this.trail.shift();
    for (const t of this.trail) t.a *= 0.9;

    // particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += 1;
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.98;
      p.vy = p.vy * 0.98 + 0.05;
      if (p.life >= p.max) this.particles.splice(i, 1);
    }

    // float texts
    for (let i = this.floatTexts.length - 1; i >= 0; i--) {
      const ft = this.floatTexts[i];
      ft.life += 1;
      ft.y += ft.vy;
      if (ft.life >= ft.max) this.floatTexts.splice(i, 1);
    }

    // shake
    this.shake *= this.shakeDecay;
    if (this.shake < 0.1) this.shake = 0;

    // walls
    if (this.ballX - this.ballR <= 0) {
      this.ballX = this.ballR;
      this.ballVX *= -1;
      this.sfx.hit();
      this.bumpShake(0.7);
    }
    if (this.ballX + this.ballR >= this.cw) {
      this.ballX = this.cw - this.ballR;
      this.ballVX *= -1;
      this.sfx.hit();
      this.bumpShake(0.7);
    }
    if (this.ballY - this.ballR <= 0) {
      this.ballY = this.ballR;
      this.ballVY *= -1;
      this.sfx.hit();
      this.bumpShake(0.7);
    }

    // paddle collision
    const px1 = this.paddleX;
    const px2 = this.paddleX + this.paddleW;
    const py1 = this.paddleY;
    const py2 = this.paddleY + this.paddleH;

    const bx = this.ballX;
    const by = this.ballY;

    const hitPaddle =
      bx >= px1 - this.ballR &&
      bx <= px2 + this.ballR &&
      by + this.ballR >= py1 &&
      by + this.ballR <= py2 + 7 &&
      this.ballVY > 0;

    if (hitPaddle) {
      if (this.magnet) {
        this.stuckToPaddle = true;
        this.sfx.hit();
      } else {
        this.ballY = py1 - this.ballR - 0.5;
        this.ballVY *= -1;
        this.sfx.hit();
      }
      this.bumpShake(1.2);

      const t = (bx - (px1 + this.paddleW / 2)) / (this.paddleW / 2);
      const max = this.cw * 0.014 * this.speedMul;
      const add = t * (this.cw * 0.004);
      this.ballVX = clamp(this.ballVX + add, -max, max);

      if (this.level >= 3 && !this.stuckToPaddle) {
        this.ballVX *= 1.004;
        this.ballVY *= 1.004;
      }
    }

    // powerups
    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      const pu = this.powerUps[i];
      pu.y += pu.vy;

      const caught =
        pu.x >= this.paddleX - pu.r &&
        pu.x <= this.paddleX + this.paddleW + pu.r &&
        pu.y + pu.r >= this.paddleY &&
        pu.y - pu.r <= this.paddleY + this.paddleH;

      if (caught) {
        this.powerUps.splice(i, 1);
        this.applyPowerUp(pu.type);
        continue;
      }
      if (pu.y - pu.r > this.ch) this.powerUps.splice(i, 1);
    }

    // brick collision
    for (let i = 0; i < this.bricks.length; i++) {
      const br = this.bricks[i];
      if (!br.alive) continue;

      const withinX = bx >= br.x - this.ballR && bx <= br.x + br.w + this.ballR;
      const withinY = by >= br.y - this.ballR && by <= br.y + br.h + this.ballR;
      if (!withinX || !withinY) continue;

      if (!this.fireball) {
        const cx = clamp(bx, br.x, br.x + br.w);
        const cy = clamp(by, br.y, br.y + br.h);
        const dx = bx - cx;
        const dy = by - cy;
        if (Math.abs(dx) > Math.abs(dy)) this.ballVX *= -1;
        else this.ballVY *= -1;
      }

      const now = ts || performance.now();
      if (now - this.lastHitAt < 1200) this.combo += 1;
      else this.combo = 1;
      this.lastHitAt = now;

      br.hp -= 1;
      this.sfx.brick();

      const power = br.hp <= 0 ? 1.15 : 0.75;
      this.addParticles(bx, by, br.hue, power);
      this.bumpShake(br.hp <= 0 ? 3.2 : 1.6);

      if (br.hp <= 0) {
        br.alive = false;
        if (br.isBoss) this.bricksRemaining = 0;
        else this.bricksRemaining -= 1;

        const base = br.isBoss ? 120 : 10;
        const comboBonus = Math.min(30, (this.combo - 1) * 3);
        const gained = base + comboBonus;

        this.score += gained;
        this.onEvent({ type: "score", score: this.score });
        this.addFloatText(bx, by, `+${gained}`);

        if (!br.isBoss) this.maybeDropPowerUp(bx, by);
      } else {
        const gained = br.isBoss ? 8 : 3;
        this.score += gained;
        this.onEvent({ type: "score", score: this.score });
        this.addFloatText(bx, by, `+${gained}`);
      }

      if (this.bricksRemaining <= 0) {
        const perfect = this.perfectEligible;
        this.setState("win");
        this.sfx.win();
        this.onEvent({
          type: "win",
          score: this.score,
          level: this.level,
          perfect,
          boss: isBossLevel(this.level),
        });
        return;
      }

      break;
    }

    // lose
    if (this.ballY - this.ballR > this.ch) {
      this.perfectEligible = false;
      this.setState("gameover");
      this.sfx.lose();
      this.onEvent({ type: "lose", score: this.score, level: this.level });
      return;
    }
  }

  private rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  draw() {
    const ctx = this.ctx;
    if (!ctx) return;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const bg = ctx.createLinearGradient(0, 0, this.cw, this.ch);
    bg.addColorStop(0, "#070A14");
    bg.addColorStop(0.55, "#070A12");
    bg.addColorStop(1, "#04050B");
    ctx.fillStyle = bg;
    ctx.fillRect(-50, -50, this.cw + 100, this.ch + 100);

    // grid
    ctx.globalAlpha = 0.07;
    ctx.strokeStyle = "rgba(139,92,246,0.9)";
    ctx.lineWidth = 1;
    const grid = 26;
    for (let x = 0; x <= this.cw; x += grid) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.ch);
      ctx.stroke();
    }
    for (let y = 0; y <= this.ch; y += grid) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.cw, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // frame
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.shadowBlur = 18;
    ctx.shadowColor = this.skin.glow;
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 2;
    this.rr(ctx, 10, 10, this.cw - 20, this.ch - 20, 22);
    ctx.stroke();
    ctx.restore();

    // bricks
    for (const br of this.bricks) {
      if (!br.alive) continue;
      const g = ctx.createLinearGradient(br.x, br.y, br.x + br.w, br.y + br.h);
      const hi = br.isBoss ? 70 : br.hp > 1 ? 62 : 58;
      const lo = br.isBoss ? 56 : br.hp > 1 ? 50 : 46;
      g.addColorStop(0, `hsla(${br.hue}, 92%, ${hi}%, 0.96)`);
      g.addColorStop(1, `hsla(${(br.hue + 40) % 360}, 92%, ${lo}%, 0.96)`);

      ctx.save();
      ctx.shadowBlur = br.isBoss ? 18 : 10;
      ctx.shadowColor = `hsla(${br.hue}, 90%, 60%, ${br.isBoss ? 0.5 : 0.35})`;
      ctx.fillStyle = g;
      this.rr(ctx, br.x, br.y, br.w, br.h, br.isBoss ? 14 : 8);
      ctx.fill();

      ctx.globalAlpha = 0.18;
      ctx.fillStyle = "#fff";
      this.rr(ctx, br.x + 3, br.y + 3, br.w - 6, 5, 6);
      ctx.fill();

      if (br.hp > 1) {
        ctx.globalAlpha = 0.92;
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        this.rr(ctx, br.x + br.w - 44, br.y + 5, 38, 16, 8);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.font = "11px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(br.hp), br.x + br.w - 25, br.y + 13);
      }

      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // powerups
    for (const pu of this.powerUps) {
      ctx.save();
      ctx.shadowBlur = 16;
      ctx.shadowColor = "rgba(255,255,255,0.18)";
      ctx.fillStyle = "rgba(255,255,255,0.10)";
      ctx.beginPath();
      ctx.arc(pu.x, pu.y, pu.r + 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.arc(pu.x, pu.y, pu.r, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.95;
      ctx.font = "14px ui-sans-serif, system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fillText(POWER_ICON[pu.type], pu.x, pu.y + 0.5);
      ctx.restore();
    }

    // paddle
    const px = this.paddleX;
    const py = this.paddleY;
    const pg = ctx.createLinearGradient(px, py, px + this.paddleW, py);
    pg.addColorStop(0, this.skin.a);
    pg.addColorStop(0.5, this.skin.b);
    pg.addColorStop(1, this.skin.c);

    ctx.save();
    ctx.shadowBlur = 18;
    ctx.shadowColor = this.skin.glow;
    ctx.fillStyle = pg;
    this.rr(ctx, px, py, this.paddleW, this.paddleH, 10);
    ctx.fill();
    ctx.restore();

    // ball
    ctx.save();
    ctx.shadowBlur = this.fireball ? 26 : 18;
    ctx.shadowColor = this.fireball ? "rgba(245,158,11,0.35)" : this.skin.glow;
    const brad = ctx.createRadialGradient(
      this.ballX - 2,
      this.ballY - 2,
      2,
      this.ballX,
      this.ballY,
      this.ballR * 2.2
    );
    brad.addColorStop(0, "rgba(255,255,255,0.96)");
    brad.addColorStop(0.5, this.fireball ? "rgba(245,158,11,0.75)" : "rgba(34,211,238,0.78)");
    brad.addColorStop(1, "rgba(139,92,246,0.0)");
    ctx.fillStyle = brad;
    ctx.beginPath();
    ctx.arc(this.ballX, this.ballY, this.ballR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // particles
    for (const p of this.particles) {
      const t = 1 - p.life / p.max;
      ctx.globalAlpha = Math.max(0, t);
      ctx.fillStyle = `hsla(${p.hue}, 95%, 60%, ${0.9 * t})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

/* =======================
   SFX (WebAudio) — no any
   ======================= */
type AudioContextCtor = new () => AudioContext;
declare global {
  interface Window {
    webkitAudioContext?: AudioContextCtor;
  }
}

function createSfx(getMuted: () => boolean) {
  const audioRef = { current: null as AudioContext | null };

  function ensureAudio() {
    if (getMuted()) return null;
    if (!audioRef.current) {
      try {
        const Ctx: AudioContextCtor | undefined = window.AudioContext ?? window.webkitAudioContext;
        audioRef.current = Ctx ? new Ctx() : null;
      } catch {
        audioRef.current = null;
      }
    }
    return audioRef.current;
  }

  function beep(freq: number, durMs: number, type: OscillatorType, gainVal: number) {
    const ac = ensureAudio();
    if (!ac) return;
    if (ac.state === "suspended") ac.resume().catch(() => {});
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.value = freq;

    const now = ac.currentTime;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gainVal, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + durMs / 1000);

    o.connect(g);
    g.connect(ac.destination);
    o.start();
    o.stop(now + durMs / 1000 + 0.02);
  }

  return {
    hit: () => beep(520, 55, "square", 0.08),
    brick: () => beep(760, 70, "triangle", 0.095),
    power: () => beep(980, 90, "triangle", 0.09),
    lose: () => beep(180, 240, "sawtooth", 0.065),
    win: () => {
      beep(660, 90, "triangle", 0.08);
      setTimeout(() => beep(880, 120, "triangle", 0.08), 90);
    },
  };
}

/* =======================
   UI
   ======================= */
export default function BrickBreakerMiniApp() {
  const storeRef = useRef<StorageStore | null>(null);
  const analyticsRef = useRef<AnalyticsAdapter | null>(null);
  const rewardsRef = useRef<RewardsAdapter | null>(null);
  const leaderboardRef = useRef<LeaderboardAdapter | null>(null);

  const engineRef = useRef<GameEngine | null>(null);
  const rafRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [mounted, setMounted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [practiceMode, setPracticeMode] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState(DAILY_ATTEMPTS);

  // hydration-safe
  const [dateKey, setDateKey] = useState<string>("");
  const [countdownSec, setCountdownSec] = useState<number>(0);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [weekly, setWeekly] = useState<WeeklyState | null>(null);

  const [toast, setToast] = useState<string | null>(null);

  const [gameState, setGameState] = useState<GameState>("idle");
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);

  const [perfectRun, setPerfectRun] = useState(false);

  const runConsumedAttemptRef = useRef(false);

  const [challenge, setChallenge] = useState<Challenge>({
    active: false,
    targetScore: 0,
    targetLevel: 0,
    weekKey: "",
  });

  const [shareCopied, setShareCopied] = useState(false);

  const lockedOut = !practiceMode && attemptsLeft <= 0;

  const skinVars = useMemo(() => {
    const sid = profile?.selectedSkin ?? "neon";
    return SKINS[sid].vars;
  }, [profile?.selectedSkin]);

  const toastOnce = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2400);
  }, []);

  const canStart = useCallback(() => {
    return practiceMode || attemptsLeft > 0;
  }, [practiceMode, attemptsLeft]);

  const consumeAttemptOnce = useCallback(() => {
    if (practiceMode) return;
    if (runConsumedAttemptRef.current) return;
    runConsumedAttemptRef.current = true;

    const store = storeRef.current!;
    const today = getIstanbulDateKey();

    setAttemptsLeft((prev) => {
      const next = Math.max(0, prev - 1);
      store.saveAttempts(today, next);
      return next;
    });
  }, [practiceMode]);

  const startGame = useCallback(() => {
    if (!canStart()) return;

    const engine = engineRef.current!;
    runConsumedAttemptRef.current = false;

    engine.setLevel(level);
    engine.start();

    analyticsRef.current?.track("start", {
      level,
      mode: practiceMode ? "practice" : "daily",
      challenge: challenge.active,
    });
  }, [canStart, level, practiceMode, challenge.active]);

  const togglePause = useCallback(() => {
    engineRef.current?.togglePause();
  }, []);

  const resetToIdle = useCallback(
    (resetLevelTo1: boolean) => {
      const engine = engineRef.current!;
      runConsumedAttemptRef.current = false;
      setPerfectRun(false);

      if (resetLevelTo1) {
        setLevel(1);
        engine.setLevel(1);
        engine.resetToIdle();
      } else {
        engine.resetToIdle();
      }
    },
    []
  );

  const nextLevel = useCallback(() => {
    const nl = Math.min(MAX_LEVEL, level + 1);
    setLevel(nl);
    setScore(0);
    setPerfectRun(false);

    const engine = engineRef.current!;
    runConsumedAttemptRef.current = false;
    engine.setLevel(nl);
    engine.start();
  }, [level]);

  const setSkin = useCallback((id: SkinId) => {
    setProfile((prev) => {
      if (!prev) return prev;
      if (!prev.unlockedSkins.includes(id)) return prev;
      const next = { ...prev, selectedSkin: id };
      storeRef.current?.saveProfile(next);
      return next;
    });
    toastOnce(`Skin: ${SKINS[id].name}`);
  }, [toastOnce]);

  const shareScore = useCallback(async () => {
    const url = new URL(window.location.href);
    url.searchParams.set("bbScore", String(score));
    url.searchParams.set("bbLv", String(level));
    url.searchParams.set("bbW", weekly?.weekKey ?? getIstanbulWeekKey());

    const text = `I scored ${score} on Brick Breaker (LV ${level})! Can you beat me?`;

    if (navigator.share) {
      try {
        await navigator.share({ title: "Brick Breaker", text, url: url.toString() });
        analyticsRef.current?.track("share", { method: "native" });
        return;
      } catch {
        // fall through to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(url.toString());
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 1600);
      analyticsRef.current?.track("share", { method: "copy" });
    } catch {
      toastOnce("Couldn’t copy link. (Browser permission)");
    }
  }, [score, level, weekly?.weekKey, toastOnce]);

  /* INIT */
  useEffect(() => {
    setMounted(true);

    storeRef.current = new StorageStore();
    analyticsRef.current = new ConsoleAnalytics();
    rewardsRef.current = new DefaultRewards();
    leaderboardRef.current = new LocalLeaderboard();

    const store = storeRef.current;
    const rewards = rewardsRef.current!;
    const lb = leaderboardRef.current!;

    setMuted(store.loadMuted());

    setDateKey(getIstanbulDateKey());
    setCountdownSec(secondsUntilNextIstanbulMidnight());

    const att = store.loadAttempts();
    setAttemptsLeft(att.left);

    const p0 = store.loadProfile();
    const wk = getIstanbulWeekKey();
    const w0 = lb.getWeekly(wk);

    const daily = rewards.applyDailyReward(p0, att.left, false);
    store.saveProfile(daily.profile);
    setProfile(daily.profile);
    setAttemptsLeft(daily.attemptsLeft);
    setWeekly(w0);

    if (daily.message) toastOnce(daily.message);

    // Challenge link parse
    try {
      const url = new URL(window.location.href);
      const bbScore = Number(url.searchParams.get("bbScore") || "0");
      const bbLv = Number(url.searchParams.get("bbLv") || "0");
      const bbW = String(url.searchParams.get("bbW") || wk);
      if (Number.isFinite(bbScore) && bbScore > 0) {
        setChallenge({
          active: true,
          targetScore: Math.floor(bbScore),
          targetLevel: Math.max(1, Math.floor(bbLv || 1)),
          weekKey: bbW,
        });
        toastOnce(`Challenge accepted: beat ${Math.floor(bbScore)}!`);
      }
    } catch {}

    const t = window.setInterval(() => {
      setCountdownSec(secondsUntilNextIstanbulMidnight());
      setDateKey(getIstanbulDateKey());
      const att2 = store.loadAttempts();
      setAttemptsLeft(att2.left);
      const wk2 = getIstanbulWeekKey();
      setWeekly(lb.getWeekly(wk2));
    }, 1000);

    return () => window.clearInterval(t);
  }, [toastOnce]);

  useEffect(() => {
    storeRef.current?.saveMuted(muted);
  }, [muted]);

  /* ENGINE create */
  useEffect(() => {
    if (!engineRef.current) {
      engineRef.current = new GameEngine((e) => {
        if (e.type === "score") setScore(e.score);
        if (e.type === "state") setGameState(e.state);
        if (e.type === "toast") toastOnce(e.message);

        if (e.type === "win") {
          consumeAttemptOnce();
          setPerfectRun(!practiceMode && e.perfect);

          const store = storeRef.current!;
          const rewards = rewardsRef.current!;
          const lb = leaderboardRef.current!;
          const wk = getIstanbulWeekKey();

          const current = store.loadProfile();
          const baseXp = e.boss ? 160 : 90;
          const lvlBonus = Math.min(120, e.level * 10);
          const perfBonus = !practiceMode && e.perfect ? 80 : 0;

          let next = rewards.awardXp(current, baseXp + lvlBonus + perfBonus);
          next = rewards.unlockSkins(next);
          next = { ...next, bestScoreAllTime: Math.max(next.bestScoreAllTime, e.score) };
          store.saveProfile(next);
          setProfile(next);

          setWeekly(lb.submitWeekly(wk, { playerId: next.playerId, name: "You", score: e.score, ts: Date.now() }));
        }

        if (e.type === "lose") {
          consumeAttemptOnce();

          const store = storeRef.current!;
          const rewards = rewardsRef.current!;
          const current = store.loadProfile();

          let next = rewards.awardXp(current, 18 + Math.min(20, e.level));
          next = rewards.unlockSkins(next);

          store.saveProfile(next);
          setProfile(next);
          setPerfectRun(false);
        }
      });

      const sfx = createSfx(() => muted);
      engineRef.current.sfx = sfx;
    }

    engineRef.current.setSkin(skinVars);
  }, [muted, skinVars, toastOnce, consumeAttemptOnce, practiceMode]);

  /* resize */
  useEffect(() => {
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!canvas || !engine) return;

    const resize = () => {
      const parent = canvas.parentElement;
      const maxW = parent ? parent.clientWidth : 520;
      const cssW = Math.max(320, Math.min(600, maxW));
      const cssH = Math.round(cssW * (640 / 420));

      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);

      engine.bindCanvas(canvas, dpr, cssW, cssH);
      if (engine.state === "idle") engine.hardResetWorld(engine.level);
      engine.draw();
    };

    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [gameState]);

  /* loop */
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    const tick = (ts: number) => {
      engine.step(ts);
      engine.draw();
      if (engine.state === "running") rafRef.current = requestAnimationFrame(tick);
    };

    if (engine.state === "running") {
      rafRef.current = requestAnimationFrame(tick);
      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      };
    } else {
      engine.draw();
    }
  }, [gameState]);

  /* keyboard */
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") engine.input.left = true;
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") engine.input.right = true;

      if (e.key === " " || e.key === "Enter") {
        if (engine.state === "running") togglePause();
        else if (engine.state === "paused") togglePause();
        else if ((engine.state === "idle" || engine.state === "gameover" || engine.state === "win") && canStart())
          startGame();
      }

      if ((e.key === "ArrowUp" || e.key === "w" || e.key === "W") && engine.stuckToPaddle) {
        engine.releaseBallFromMagnet();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") engine.input.left = false;
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") engine.input.right = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [togglePause, canStart, startGame]);

  /* pointer */
  useEffect(() => {
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!canvas || !engine) return;

    const getLocalX = (clientX: number) => {
      const rect = canvas.getBoundingClientRect();
      const x = (clientX - rect.left) / rect.width;
      return x * engine.cw;
    };

    const onPointerDown = (e: PointerEvent) => {
      engine.input.pointerActive = true;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {}
      engine.movePaddleTo(getLocalX(e.clientX));

      if (engine.state !== "running" && engine.state !== "paused" && canStart()) startGame();
      if (engine.stuckToPaddle) engine.releaseBallFromMagnet();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!engine.input.pointerActive) return;
      engine.movePaddleTo(getLocalX(e.clientX));
    };

    const onPointerUp = () => {
      engine.input.pointerActive = false;
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [canStart, startGame]);

  const weekKey = weekly?.weekKey ?? (mounted ? getIstanbulWeekKey() : "");
  const weeklyTop = weekly?.top ?? [];

  const hearts = useMemo(() => {
    if (practiceMode) return "∞";
    const max = DAILY_ATTEMPTS + 1;
    const full = clamp(attemptsLeft, 0, max);
    const empty = max - full;
    return `${"❤️".repeat(full)}${"🤍".repeat(empty)}`;
  }, [practiceMode, attemptsLeft]);

  const overlayTitle = useMemo(() => {
    if (lockedOut) return "Come back tomorrow";
    if (gameState === "paused") return "Paused";
    if (gameState === "gameover") return "Game Over";
    if (gameState === "win") return isBossLevel(level) ? "Boss defeated 🏆" : "Level cleared 🎉";
    return "Ready?";
  }, [lockedOut, gameState, level]);

  const overlaySubtitle = useMemo(() => {
    if (lockedOut) return `Daily attempts bitti. Yenilenmeye: ${mounted ? formatHMS(countdownSec) : "--:--:--"} (TR)`;
    if (gameState === "paused") return "Resume (Space/Enter) • Drag or ← →";
    if (gameState === "gameover") return practiceMode ? "Practice mode açık, hak düşmez." : "1 hak kullanıldı.";
    if (gameState === "win") return practiceMode ? "Practice mode açık, hak düşmez." : "1 hak kullanıldı.";
    return practiceMode ? "∞ Practice mode: sınırsız deneme." : `Günlük ${DAILY_ATTEMPTS} hakkın var.`;
  }, [lockedOut, mounted, countdownSec, gameState, practiceMode]);

  const primaryCTA =
    lockedOut ? "Practice" : gameState === "paused" ? "Resume" : gameState === "running" ? "Pause" : "Start";

  const onPrimaryCTA = useCallback(() => {
    if (lockedOut) {
      setPracticeMode(true);
      return;
    }
    if (gameState === "running") togglePause();
    else if (gameState === "paused") togglePause();
    else startGame();
  }, [lockedOut, gameState, togglePause, startGame]);

  const unlockedSkins = profile?.unlockedSkins ?? ["neon"];
  const beatChallenge = useMemo(() => {
    if (!challenge.active) return false;
    return score >= challenge.targetScore;
  }, [challenge.active, challenge.targetScore, score]);

  return (
    <div
      className="w-full max-w-[980px] mx-auto p-4 sm:p-6"
      style={
        {
          ["--a" as unknown as string]: skinVars.a,
          ["--b" as unknown as string]: skinVars.b,
          ["--c" as unknown as string]: skinVars.c,
          ["--glow" as unknown as string]: skinVars.glow,
        } as React.CSSProperties
      }
    >
      <div className="relative">
        <div className="absolute inset-0 -z-10 overflow-hidden rounded-[30px]">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.26),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(34,211,238,0.18),transparent_60%)]" />
          <div className="absolute inset-0 opacity-25 bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:42px_42px]" />
          <div className="absolute -inset-[35%] opacity-25 blur-3xl animate-[spin_18s_linear_infinite] bg-[conic-gradient(from_180deg,rgba(34,211,238,0.55),rgba(139,92,246,0.55),rgba(59,130,246,0.5),rgba(34,211,238,0.55))]" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/35 to-black/70" />
          <div className="absolute inset-0 particles-layer opacity-35" />
        </div>

        <div className="rounded-[30px] border border-white/10 bg-white/5 backdrop-blur-xl shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_30px_90px_rgba(0,0,0,0.6)] p-4 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-[var(--a)] via-[var(--b)] to-[var(--c)] drop-shadow">
                  BRICK BREAKER
                </div>
                <span className="text-xs px-2 py-1 rounded-full border border-white/10 bg-black/40 text-white/80">
                  Phase-2 (No mint)
                </span>
              </div>

              <div className="mt-1 text-sm text-white/70">
                Break. Power-up. Level-up. <span className="text-white/85">Beat weekly rank.</span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <div className="px-3 py-2 rounded-2xl border border-white/10 bg-black/30">
                  <div className="text-[11px] text-white/60">Lives</div>
                  <div className="text-sm">{hearts}</div>
                </div>

                <div className="px-3 py-2 rounded-2xl border border-white/10 bg-black/30">
                  <div className="text-[11px] text-white/60">Level</div>
                  <div className="text-sm font-semibold">
                    LV {level} {isBossLevel(level) ? "· BOSS" : ""}
                  </div>
                </div>

                <div className="px-3 py-2 rounded-2xl border border-white/10 bg-black/30">
                  <div className="text-[11px] text-white/60">Player</div>
                  <div className="text-sm font-semibold">
                    LV {profile?.playerLevel ?? 1} · {profile?.xp ?? 0} XP
                  </div>
                </div>

                <div className="px-3 py-2 rounded-2xl border border-white/10 bg-black/30">
                  <div className="text-[11px] text-white/60">Streak</div>
                  <div className="text-sm font-semibold">🔥 {profile?.streakDays ?? 0}</div>
                </div>

                {challenge.active && (
                  <div className="px-3 py-2 rounded-2xl border border-white/10 bg-black/30">
                    <div className="text-[11px] text-white/60">Challenge</div>
                    <div className="text-sm font-semibold">
                      Beat {challenge.targetScore} {beatChallenge ? "✅" : ""}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 items-center justify-start sm:justify-end">
              <button
                className={`group flex items-center gap-2 px-3 py-2 rounded-2xl border transition ${
                  practiceMode ? "border-[var(--b)]/30 bg-[var(--b)]/10" : "border-white/10 bg-black/20 hover:border-white/20"
                }`}
                onClick={() => setPracticeMode((v) => !v)}
                aria-label="Toggle practice mode"
              >
                <span className="text-sm text-white/80">Practice</span>
                <span className={`relative w-10 h-6 rounded-full transition ${practiceMode ? "bg-[var(--b)]/60" : "bg-white/10"}`}>
                  <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white/90 transition ${practiceMode ? "translate-x-4" : ""}`} />
                </span>
                <span className={`text-xs ${practiceMode ? "text-[var(--b)]" : "text-white/55"}`}>{practiceMode ? "∞" : ""}</span>
              </button>

              <button
                className={`px-3 py-2 rounded-2xl border transition ${
                  muted ? "border-white/10 bg-black/20 text-white/50" : "border-white/10 bg-black/20 hover:border-white/20"
                }`}
                onClick={() => setMuted((m) => !m)}
                aria-label="Toggle sound"
              >
                <span className="text-sm">{muted ? "🔇" : "🔊"}</span>
              </button>

              <button
                className="px-3 py-2 rounded-2xl border border-white/10 bg-black/20 hover:border-white/20 transition text-sm text-white/80"
                onClick={() => resetToIdle(false)}
              >
                Reset
              </button>

              <button
                className={`px-4 py-2 rounded-2xl border text-sm font-semibold transition active:scale-[0.98] ${
                  lockedOut
                    ? "border-[var(--a)]/30 bg-[var(--a)]/10 text-white/90 hover:bg-[var(--a)]/15"
                    : "border-white/10 bg-white/10 text-white/90 hover:bg-white/15 hover:border-white/20"
                }`}
                onClick={onPrimaryCTA}
              >
                {primaryCTA}
              </button>
            </div>
          </div>

          {toast && (
            <div className="mt-3">
              <div className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl border border-white/10 bg-black/35 text-sm text-white/85">
                <span>✨</span>
                <span>{toast}</span>
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className={`text-base sm:text-lg font-extrabold tracking-tight ${
                  gameState === "running" ? "animate-[pulse_1.8s_ease-in-out_infinite]" : ""
                } bg-clip-text text-transparent bg-gradient-to-r from-white via-[var(--a)] to-[var(--b)]`}
              >
                {score}
              </div>
              <div className="text-xs text-white/60">SCORE</div>

              {perfectRun && gameState === "win" && !practiceMode && (
                <span className="text-xs px-2 py-1 rounded-full border border-emerald-300/20 bg-emerald-500/10 text-emerald-200">
                  Perfect Run ⭐
                </span>
              )}

              {weekly && profile && (
                <span className="text-xs px-2 py-1 rounded-full border border-white/10 bg-white/5 text-white/75">
                  Weekly rank: #{weekly.top.findIndex((e) => e.playerId === profile.playerId) + 1 || "—"}
                </span>
              )}
            </div>

            <div className="text-xs text-white/60">
              {practiceMode ? "Attempts: ∞" : `Attempts left: ${attemptsLeft}/${DAILY_ATTEMPTS}+`} • Drag/←→ • Space: Pause • Tap: magnet release
            </div>
          </div>

          <div className="mt-4 relative">
            <div className="rounded-[26px] overflow-hidden border border-white/10 bg-black/30 shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_20px_60px_rgba(0,0,0,0.55)]">
              <canvas ref={canvasRef} className="block w-full h-auto touch-none select-none" />
            </div>

            {(gameState !== "running" || lockedOut) && (
              <div className="absolute inset-0 flex items-center justify-center p-4">
                <div className="w-full max-w-[760px] rounded-[26px] border border-white/10 bg-black/65 backdrop-blur-xl shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_30px_90px_rgba(0,0,0,0.7)] p-5 sm:p-6 text-center">
                  <div className="text-xl sm:text-2xl font-extrabold text-white/95">{overlayTitle}</div>
                  <div className="mt-2 text-sm text-white/70">{overlaySubtitle}</div>

                  <div className="mt-4">
                    <div className="text-[11px] text-white/55 mb-2">Skins (unlock by Player LV)</div>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {(Object.keys(SKINS) as SkinId[]).map((sid) => {
                        const unlocked = unlockedSkins.includes(sid);
                        const selected = profile?.selectedSkin === sid;
                        return (
                          <button
                            key={sid}
                            onClick={() => unlocked && setSkin(sid)}
                            className={`px-3 py-2 rounded-2xl border text-sm transition ${
                              selected
                                ? "border-white/20 bg-white/15 text-white"
                                : unlocked
                                  ? "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                                  : "border-white/5 bg-black/20 text-white/35 cursor-not-allowed"
                            }`}
                            title={unlocked ? `Use ${SKINS[sid].name}` : `Unlock at Player LV ${SKINS[sid].unlockLevel}`}
                          >
                            {SKINS[sid].name} {!unlocked ? <span className="text-xs opacity-70">· LV {SKINS[sid].unlockLevel}</span> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] text-white/55">Weekly tournament</div>
                      <div className="text-sm text-white/85 mt-1">
                        Week: <span className="text-white/90 font-semibold">{weekly?.weekKey ?? (mounted ? getIstanbulWeekKey() : "—")}</span>
                      </div>
                      <div className="text-xs text-white/55 mt-2">Share your score to challenge friends.</div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          className="px-4 py-2 rounded-2xl border border-white/10 bg-black/20 text-white/85 hover:bg-white/10 transition text-sm"
                          onClick={shareScore}
                        >
                          Share challenge
                        </button>
                        {shareCopied && <div className="text-xs text-white/70 self-center">Link copied ✅</div>}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] text-white/55">Top 10</div>
                      <div className="mt-2 space-y-1">
                        {weeklyTop.length === 0 ? (
                          <div className="text-sm text-white/70">No scores yet. Be the first.</div>
                        ) : (
                          weeklyTop.map((e, idx) => (
                            <div key={e.playerId} className="flex items-center justify-between text-sm text-white/80">
                              <span className="opacity-80">#{idx + 1} {e.name}</span>
                              <span className="font-semibold text-white/90">{e.score}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2 justify-center">
                    {lockedOut ? (
                      <>
                        <button
                          className="px-5 py-2.5 rounded-2xl border border-[var(--a)]/30 bg-[var(--a)]/10 text-white/90 hover:bg-[var(--a)]/15 transition font-semibold"
                          onClick={() => setPracticeMode(true)}
                        >
                          Switch to Practice (∞)
                        </button>
                        <button
                          className="px-5 py-2.5 rounded-2xl border border-white/10 bg-white/10 text-white/85 hover:bg-white/15 transition"
                          onClick={() => resetToIdle(true)}
                        >
                          Reset Level
                        </button>
                      </>
                    ) : gameState === "win" ? (
                      <>
                        <button
                          className="px-5 py-2.5 rounded-2xl border border-white/10 bg-white/10 text-white/90 hover:bg-white/15 transition font-semibold"
                          onClick={nextLevel}
                        >
                          Next level →
                        </button>
                        <button
                          className="px-5 py-2.5 rounded-2xl border border-white/10 bg-black/20 text-white/85 hover:bg-white/10 transition"
                          onClick={startGame}
                        >
                          Replay level
                        </button>
                      </>
                    ) : gameState === "gameover" ? (
                      <>
                        <button
                          className={`px-5 py-2.5 rounded-2xl border transition font-semibold ${
                            canStart()
                              ? "border-white/10 bg-white/10 text-white/90 hover:bg-white/15"
                              : "border-white/10 bg-black/20 text-white/40 cursor-not-allowed"
                          }`}
                          onClick={startGame}
                          disabled={!canStart()}
                        >
                          Try again
                        </button>
                        <button
                          className="px-5 py-2.5 rounded-2xl border border-white/10 bg-black/20 text-white/85 hover:bg-white/10 transition"
                          onClick={() => resetToIdle(false)}
                        >
                          Back
                        </button>
                      </>
                    ) : gameState === "paused" ? (
                      <button
                        className="px-5 py-2.5 rounded-2xl border border-white/10 bg-white/10 text-white/90 hover:bg-white/15 transition font-semibold"
                        onClick={togglePause}
                      >
                        Resume
                      </button>
                    ) : (
                      <button
                        className={`px-5 py-2.5 rounded-2xl border transition font-semibold ${
                          canStart()
                            ? "border-white/10 bg-white/10 text-white/90 hover:bg-white/15"
                            : "border-white/10 bg-black/20 text-white/40 cursor-not-allowed"
                        }`}
                        onClick={startGame}
                        disabled={!canStart()}
                      >
                        Press Start
                      </button>
                    )}
                  </div>

                  <div className="mt-4 text-xs text-white/45">
                    {practiceMode ? "Practice mode is on." : "Daily attempts reset at 00:00 (Europe/Istanbul)."} •{" "}
                    <span className="text-white/55">Countdown:</span>{" "}
                    <span suppressHydrationWarning>{mounted ? formatHMS(countdownSec) : "--:--:--"}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-white/45">
            <div>
              <span className="text-white/55">Week:</span> {weekKey || "—"} •{" "}
              <span className="text-white/55">TR date:</span>{" "}
              <span suppressHydrationWarning>{mounted ? dateKey : "---- -- --"}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="px-3 py-2 rounded-2xl border border-white/10 bg-black/20 hover:border-white/20 transition text-xs text-white/80"
                onClick={shareScore}
              >
                Share
              </button>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes floatDots {
          0% {
            transform: translateY(0px);
            opacity: 0.28;
          }
          50% {
            transform: translateY(-16px);
            opacity: 0.48;
          }
          100% {
            transform: translateY(0px);
            opacity: 0.28;
          }
        }
        .particles-layer {
          background-image: radial-gradient(circle at 15% 30%, rgba(255, 255, 255, 0.22) 0 1px, transparent 2px),
            radial-gradient(circle at 60% 20%, rgba(255, 255, 255, 0.18) 0 1px, transparent 2px),
            radial-gradient(circle at 80% 65%, rgba(255, 255, 255, 0.16) 0 1px, transparent 2px),
            radial-gradient(circle at 25% 75%, rgba(255, 255, 255, 0.16) 0 1px, transparent 2px),
            radial-gradient(circle at 40% 50%, rgba(255, 255, 255, 0.14) 0 1px, transparent 2px);
          background-size: 520px 520px;
          animation: floatDots 4.8s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}