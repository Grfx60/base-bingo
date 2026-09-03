/* eslint-disable */
// @ts-nocheck
"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { useAccount, useConnect, useDisconnect, useSendTransaction, useWriteContract, useSwitchChain } from "wagmi";
import { parseEther } from "viem";

const GAME_FEE_RECIPIENT = "0xBe96fB12585Bd1cd2822Ae451A69eA5E8970806F";
const GAME_FEE_AMOUNT = parseEther("0.00001");

const SCORE_CONTRACT_ADDRESS = "0x63bCD5075303EA083CB08A3439075a7e87B5166B";

const SCORE_CONTRACT_ABI = [
  {
    type: "function",
    name: "submitScore",
    stateMutability: "nonpayable",
    inputs: [
      { name: "score", type: "uint256" },
      { name: "level", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

const BASE_SEPOLIA_CHAIN_ID = 84532;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const safeUrl = supabaseUrl.startsWith("http") ? supabaseUrl : "https://dummy.supabase.co";
const supabase = createClient(safeUrl, supabaseAnonKey || "dummy-key");

const W = 390, H = 500, PW = 86, PH = 16, BR = 8;

const ROW_COLORS = [
  { top: "#ff90c0", mid: "#ff2d78", bot: "#990040", shine: "rgba(255,210,230,0.72)" },
  { top: "#ffb580", mid: "#ff6000", bot: "#993600", shine: "rgba(255,225,180,0.72)" },
  { top: "#fff080", mid: "#ffcc00", bot: "#997800", shine: "rgba(255,250,180,0.72)" },
  { top: "#98f070", mid: "#44cc00", bot: "#228800", shine: "rgba(190,255,160,0.72)" },
  { top: "#78ecf8", mid: "#00c0d8", bot: "#007888", shine: "rgba(160,248,255,0.72)" },
  { top: "#cc98ff", mid: "#8040ff", bot: "#4000cc", shine: "rgba(218,188,255,0.72)" },
];

export default function BrickBreakerMiniApp() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();
  const canvasRef = useRef(null);
  const bgCanvasRef = useRef(null);
  const bgMusicRef = useRef(null);

  const [isPaying, setIsPaying] = useState(false);
  const [paymentError, setPaymentError] = useState(null);
  const [onchainScoreStatus, setOnchainScoreStatus] = useState("idle");
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
  const [mission, setMission] = useState({
    type: "bricks",
    target: 12,
    progress: 0,
    label: "BREAK 12 BRICKS",
    reward: 75,
  });
  const [missionComplete, setMissionComplete] = useState(false);
  const [maxCombo, setMaxCombo] = useState(0);
  const [perfectHits, setPerfectHits] = useState(0);
  const [chainCount, setChainCount] = useState(0);
  const [levelTime, setLevelTime] = useState(0);
  const [comboShield, setComboShield] = useState(false);
  const [feverMode, setFeverMode] = useState(false);
  const [feverSeconds, setFeverSeconds] = useState(0);
  const [feverActivations, setFeverActivations] = useState(0);
  const [eliteHits, setEliteHits] = useState(0);
  const [bossActive, setBossActive] = useState(false);
  const [bossHp, setBossHp] = useState(0);
  const [bossMaxHp, setBossMaxHp] = useState(0);
  const [bricksBrokenRun, setBricksBrokenRun] = useState(0);
  const [powerupsCollectedRun, setPowerupsCollectedRun] = useState(0);
  const [bossesDefeatedRun, setBossesDefeatedRun] = useState(0);
  const [achievements, setAchievements] = useState({});
  const [achievementPopup, setAchievementPopup] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [challengeProgress, setChallengeProgress] = useState(0);
  const [challengeComplete, setChallengeComplete] = useState(false);
  const [activePowerUp, setActivePowerUp] = useState(null);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [leaderboardRows, setLeaderboardRows] = useState([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [bestScore, setBestScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [showCombo, setShowCombo] = useState(false);
  const [comboMessage, setComboMessage] = useState("NICE!");
  const [isNewHigh, setIsNewHigh] = useState(false);
  const [puCounts, setPuCounts] = useState({ WIDE: 0, FIRE: 0, LIFE: 0, FREEZE: 0, MULTI: 0 });
  const [prevState, setPrevState] = useState("menu");

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
  const ballsRef = useRef([]);
  const multiTimerRef = useRef(null);

  // Phase 3 — game feel / feedback
  const comboTimerRef = useRef(null);
  const floatTextRef = useRef([]);
  const hitFlashRef = useRef([]);
  const shakeRef = useRef(0);
  const levelStartLivesRef = useRef(4);

  // Phase 5 — mission / progression
  const missionRef = useRef(null);
  const missionRewardedRef = useRef(false);
  const levelScoreStartRef = useRef(0);
  const bricksBrokenRef = useRef(0);

  // Phase 6 — game feel
  const maxComboRef = useRef(0);
  const perfectHitsRef = useRef(0);
  const perfectFlashRef = useRef(0);
  const comboShieldRef = useRef(false);
  const comboShieldUsedRef = useRef(false);
  const chainCountRef = useRef(0);
  const chainTimerRef = useRef(null);
  const lastBrickHitRef = useRef(0);
  const levelTimeRef = useRef(0);
  const speedBoostRef = useRef(0);
  const feverRef = useRef(false);
  const feverUsedRef = useRef(false);
  const feverTimerRef = useRef(null);
  const feverEndRef = useRef(0);
  const eliteHitsRef = useRef(0);
  const bossRef = useRef(null);
  const bossActiveRef = useRef(false);
  const bossPulseRef = useRef(0);

  // Phase 10 — Run Mastery / Achievements
  const bricksBrokenRunRef = useRef(0);
  const powerupsCollectedRunRef = useRef(0);
  const bossesDefeatedRunRef = useRef(0);
  const achievementsRef = useRef({});
  const challengeRef = useRef(null);
  const challengeProgressRef = useRef(0);
  const challengeCompleteRef = useRef(false);

  // Phase 11.2 — collision/render smoothing
  const uiSyncRef = useRef(0);
  const lastHitSoundRef = useRef(0);
  const lastBrickSoundRef = useRef(0);
  const comboMessageTimerRef = useRef(null);

  // Phase 11.3 — level transition guard
  // Prevents the animation loop from completing the same level more than once
  // before React commits the gameState update to "levelup".
  const levelTransitionRef = useRef(false);
  const scoreSubmittedRef = useRef(false);

  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { levelRef.current = level; }, [level]);
  useEffect(() => { livesRef.current = lives; }, [lives]);
  useEffect(() => { gsRef.current = gameState; }, [gameState]);
  useEffect(() => { pausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { bestRef.current = bestScore; }, [bestScore]);
  useEffect(() => {
    return () => {
      if (multiTimerRef.current) window.clearTimeout(multiTimerRef.current);
      if (comboTimerRef.current) window.clearTimeout(comboTimerRef.current);
      if (chainTimerRef.current) window.clearTimeout(chainTimerRef.current);
      if (feverTimerRef.current) window.clearTimeout(feverTimerRef.current);
    };
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

    if (s > bestRef.current) {
      setBestScore(s);
      setIsNewHigh(true);
    }

    // Supabase remains the fast leaderboard source.
    try {
      await supabase.rpc("upsert_best_score", {
        p_wallet: address,
        p_score: s,
        p_level: l,
      });
    } catch (_) {}

    // Also record the score on Base Sepolia as an onchain proof.
    try {
      setOnchainScoreStatus("submitting");

      if (chainId !== BASE_SEPOLIA_CHAIN_ID) {
        await switchChainAsync({ chainId: BASE_SEPOLIA_CHAIN_ID });
      }

      await writeContractAsync({
        address: SCORE_CONTRACT_ADDRESS,
        abi: SCORE_CONTRACT_ABI,
        functionName: "submitScore",
        args: [BigInt(Math.floor(s)), BigInt(Math.max(1, Math.floor(l)))],
        chainId: BASE_SEPOLIA_CHAIN_ID,
      });

      setOnchainScoreStatus("success");
    } catch (error) {
      console.error("ONCHAIN SCORE ERROR:", error);
      setOnchainScoreStatus("error");
    }
  }, [address, chainId, switchChainAsync, writeContractAsync]);
  const fetchLB = useCallback(async () => {
    setLeaderboardLoading(true);
    try {
  const { data, error } = await supabase
    .from("leaderboard")
    .select("wallet_address, best_score, best_level")
    .order("best_score", { ascending: false })
    .limit(10);

  if (error) {
    console.error("LEADERBOARD ERROR:", error);
    setLeaderboardRows([]);
    return;
  }

  console.log("LEADERBOARD DATA:", data);
  setLeaderboardRows(data || []);
} catch (error) {
  console.error("LEADERBOARD EXCEPTION:", error);
  setLeaderboardRows([]);
} finally {
  setLeaderboardLoading(false);
}
  }, []);

  // ─── Parçacık efekti ───
  const spawnPtc = (bx, by, bw, bh, color) => {
    const particles = ptcRef.current;
    const count = Math.min(5, Math.max(0, 120 - particles.length));
    for (let i = 0; i < count; i++) particles.push({ x: bx + bw / 2 + (Math.random() - 0.5) * bw * 0.75, y: by + bh / 2 + (Math.random() - 0.5) * bh, vx: (Math.random() - 0.5) * 5.5, vy: (Math.random() - 0.5) * 5.5 - 1.5, life: 1, decay: 0.052 + Math.random() * 0.05, size: 2.5 + Math.random() * 4, color });
  };

  // ─── Phase 3: görsel oyun geri bildirimi ───
  const addFloatText = (x, y, textValue, color = "#ffffff") => {
    const list = floatTextRef.current;
    if (list.length >= 24) list.shift();
    list.push({
      x,
      y,
      text: textValue,
      color,
      life: 1,
      vy: -0.55,
    });
  };

  const addHitFlash = (x, y, color = "#ffffff") => {
    const list = hitFlashRef.current;
    if (list.length >= 24) list.shift();
    list.push({
      x,
      y,
      radius: 4,
      maxRadius: 22,
      life: 1,
      color,
    });
  };

  const keepComboAlive = () => {
    if (comboTimerRef.current) window.clearTimeout(comboTimerRef.current);
    comboTimerRef.current = window.setTimeout(() => {
      comboRef.current = 0;
      setCombo(0);
    }, 2400);
  };

  // ─── Tuğla üretimi ───
  // ─── Phase 5: level görevleri ───
  const createMission = (lv = 1) => {
    const cycle = (lv - 1) % 5;

    if (cycle === 0) {
      return {
        type: "bricks",
        target: 12 + Math.min(8, Math.floor(lv / 3) * 2),
        label: "BREAK",
        reward: 75,
      };
    }

    if (cycle === 1) {
      return {
        type: "combo",
        target: 6 + Math.min(6, Math.floor(lv / 5)),
        label: "REACH COMBO",
        reward: 90,
      };
    }

    if (cycle === 2) {
      return {
        type: "powerups",
        target: 2 + Math.min(3, Math.floor(lv / 6)),
        label: "COLLECT POWER-UPS",
        reward: 100,
      };
    }

    if (cycle === 3) {
      return {
        type: "score",
        target: 180 + lv * 20,
        label: "SCORE",
        reward: 110,
      };
    }

    return {
      type: "survive",
      target: 1,
      label: "CLEAR WITH NO LIFE LOST",
      reward: 125,
    };
  };

  const createRunChallenge = () => {
    const pool = [
      { id: "brick_rush", title: "BRICK RUSH", detail: "Break 35 bricks", target: 35, type: "bricks", reward: 150 },
      { id: "combo_hunter", title: "COMBO HUNTER", detail: "Reach x12 combo", target: 12, type: "combo", reward: 175 },
      { id: "power_collector", title: "POWER COLLECTOR", detail: "Collect 4 power-ups", target: 4, type: "powerups", reward: 160 },
      { id: "perfect_run", title: "PERFECT RUN", detail: "Land 6 perfect hits", target: 6, type: "perfect", reward: 180 },
      { id: "boss_hunter", title: "ELITE HUNTER", detail: "Defeat an Elite Core", target: 1, type: "boss", reward: 250 },
    ];
    return pool[Math.floor(Math.random() * pool.length)];
  };

  const updateChallenge = (type, value) => {
    const active = challengeRef.current;
    if (!active || challengeCompleteRef.current || active.type !== type) return;

    const next = Math.min(active.target, value);
    challengeProgressRef.current = next;
    setChallengeProgress(next);

    if (next >= active.target) {
      challengeCompleteRef.current = true;
      const reward = active.reward;
      scoreRef.current += reward;
      setScore(scoreRef.current);
      setXpGained(reward);
      setPlayerXp(x => x + reward);
      setChallengeComplete(true);
      setComboMessage("CHALLENGE COMPLETE!");
      setShowCombo(true);
      window.setTimeout(() => setShowCombo(false), 1200);
      addFloatText(W / 2, H / 2 + 28, `+${reward} BONUS`, "#ffd34d");
      audio("powerup");
    }
  };

  const unlockAchievement = (id, title, detail) => {
    if (achievementsRef.current[id]) return;
    achievementsRef.current = { ...achievementsRef.current, [id]: true };
    setAchievements({ ...achievementsRef.current });
    setAchievementPopup({ title, detail });
    window.setTimeout(() => setAchievementPopup(null), 2200);
    audio("powerup");
  };

  const startMission = (lv = 1) => {
    const next = createMission(lv);
    missionRef.current = { ...next, progress: 0 };
    missionRewardedRef.current = false;
    levelScoreStartRef.current = scoreRef.current;
    bricksBrokenRef.current = 0;
    setMission({ ...next, progress: 0 });
    setMissionComplete(false);
  };

  const completeMission = () => {
    const m = missionRef.current;
    if (!m || missionRewardedRef.current) return;

    missionRewardedRef.current = true;
    setMissionComplete(true);

    scoreRef.current += m.reward;
    setScore(scoreRef.current);
    setXpGained(m.reward);
    setPlayerXp(x => x + m.reward);

    addFloatText(W / 2, 70, `MISSION +${m.reward}`, "#ffd34d");
    audio("powerup");

    window.setTimeout(() => setMissionComplete(false), 1200);
  };

  const updateMission = (progress) => {
    const m = missionRef.current;
    if (!m || missionRewardedRef.current || m.type === "survive") return;

    const nextProgress = Math.min(m.target, Math.max(0, Math.floor(progress)));
    m.progress = nextProgress;
    setMission(prev => ({ ...prev, progress: nextProgress }));

    if (nextProgress >= m.target) completeMission();
  };

  // ─── 20 özel level dizilimi + kademeli power-up ekonomisi ───
  const genBricks = (lv = 1) => {
    const cols = 8;
    const rows = Math.min(6, 5 + Math.floor((lv - 1) / 5));
    const pad = 5;
    const oTop = 16;
    const oLeft = 7;
    const bw = (W - oLeft * 2 - pad * (cols - 1)) / cols;
    const bh = 24;

    // 1 = tuğla, 0 = boşluk.
    // Her level kendi formasyonuna sahip.
    const patterns = [
      // 1 — Full Wall
      [
        "11111111",
        "11111111",
        "11111111",
        "11111111",
        "11111111",
      ],
      // 2 — Checker
      [
        "10101010",
        "01010101",
        "10101010",
        "01010101",
        "10101010",
      ],
      // 3 — Pyramid
      [
        "00011000",
        "00111100",
        "01111110",
        "11111111",
        "11111111",
      ],
      // 4 — Fortress
      [
        "11111111",
        "11011011",
        "11000011",
        "11100111",
        "11111111",
      ],
      // 5 — Diamond
      [
        "00011000",
        "00111100",
        "01111110",
        "00111100",
        "00011000",
      ],
      // 6 — Wings
      [
        "11000011",
        "11100111",
        "11111111",
        "11100111",
        "11000011",
      ],
      // 7 — Lightning
      [
        "11110000",
        "00111100",
        "00001111",
        "00111100",
        "11110000",
      ],
      // 8 — Spiral
      [
        "11111111",
        "10000001",
        "10111101",
        "10100101",
        "11111101",
      ],
      // 9 — Heart
      [
        "01100110",
        "11111111",
        "11111111",
        "01111110",
        "00111100",
      ],
      // 10 — Crown
      [
        "10101011",
        "11111111",
        "11111111",
        "11000011",
        "11111111",
      ],
      // 11 — Cross
      [
        "00011000",
        "00011000",
        "11111111",
        "11111111",
        "00011000",
      ],
      // 12 — Tunnel
      [
        "11100111",
        "11100111",
        "11000011",
        "11011011",
        "11111111",
      ],
      // 13 — Flame
      [
        "00011000",
        "00111100",
        "01111110",
        "11111111",
        "11011011",
      ],
      // 14 — Invader
      [
        "01111110",
        "11111111",
        "11011011",
        "11111111",
        "10011001",
      ],
      // 15 — Target
      [
        "11111111",
        "11000011",
        "10111101",
        "11000011",
        "11111111",
      ],
      // 16 — Snake
      [
        "11110000",
        "00111111",
        "11110000",
        "00111111",
        "11111111",
      ],
      // 17 — Wave
      [
        "00111000",
        "01111100",
        "11111110",
        "01111111",
        "00111110",
      ],
      // 18 — Skull
      [
        "01111110",
        "11100111",
        "11111111",
        "01111110",
        "00111100",
      ],
      // 19 — Rocket
      [
        "00011000",
        "00111100",
        "01111110",
        "00111100",
        "00100100",
      ],
      // 20 — Crystal
      [
        "00011000",
        "00111100",
        "01111110",
        "11111111",
        "01111110",
      ],
    ];

    const pattern = patterns[(lv - 1) % patterns.length];
    const arr = [];

    for (let r = 0; r < pattern.length; r++) {
      for (let c = 0; c < cols; c++) {
        if (pattern[r][c] !== "1") continue;

        // Level yükseldikçe 2-hit tuğla oranı artar.
        const armorChance = Math.min(
          0.50,
          0.20 + Math.max(0, lv - 1) * 0.018
        );

        const edgeProtected = r === 0 && (c === 0 || c === cols - 1);
        const threeHit =
          lv >= 5 &&
          lv % 5 === 0 &&
          !edgeProtected &&
          Math.random() < 0.12;

        const twoHit =
          !threeHit &&
          lv >= 3 &&
          !edgeProtected &&
          Math.random() < armorChance;

        arr.push({
          x: c * (bw + pad) + oLeft,
          y: r * (bh + pad) + oTop,
          width: bw,
          height: bh,
          status: threeHit ? 3 : twoHit ? 2 : 1,
          maxHits: threeHit ? 3 : twoHit ? 2 : 1,
          rc: ROW_COLORS[r % ROW_COLORS.length],
          pu: null,
        });
      }
    }

    // Power-up ekonomisi:
    // Level ilerledikçe hem sayı hem de özel power-up'ların ağırlığı artar.
    const powerUpCount =
      lv <= 4 ? 3 :
      lv <= 9 ? 4 :
      lv <= 14 ? 5 :
      6;

    const powerUpChance =
      lv <= 4 ? 0.20 :
      lv <= 9 ? 0.24 :
      lv <= 14 ? 0.28 :
      0.32;

    // FIRE ve MULTI özellikle daha sık.
    const powerUpWeights = [
      { type: "FIRE", weight: 25 },
      { type: "MULTI", weight: 25 },
      { type: "WIDE", weight: 20 },
      { type: "FREEZE", weight: 15 },
      { type: "LIFE", weight: 15 },
    ];

    const pickPowerUp = () => {
      const total = powerUpWeights.reduce((sum, item) => sum + item.weight, 0);
      let roll = Math.random() * total;

      for (const item of powerUpWeights) {
        roll -= item.weight;
        if (roll <= 0) return item.type;
      }

      return "FIRE";
    };

    const shuf = arr.map((_, i) => i);

    for (let i = shuf.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuf[i], shuf[j]] = [shuf[j], shuf[i]];
    }

    let assigned = 0;

    // LIFE kontrollü: 3'ün katlarında garanti değil, ama daha erken
    // ve daha geç seviyelerde de ulaşılabilir durumda.
    if (lv % 3 === 0 && shuf.length > 0) {
      arr[shuf[assigned++]].pu = "LIFE";
    }

    for (
      let i = assigned;
      i < shuf.length && assigned < powerUpCount;
      i++
    ) {
      if (Math.random() <= powerUpChance) {
        arr[shuf[i]].pu = pickPowerUp();
        assigned++;
      }
    }

    // Yukarıdaki rastgele seçim hedef sayıya ulaşmadıysa,
    // level ilerledikçe power-up'ların çok seyrek kalmasını önle.
    for (
      let i = assigned;
      i < shuf.length && assigned < powerUpCount;
      i++
    ) {
      const index = shuf[i];
      if (!arr[index].pu) {
        arr[index].pu = pickPowerUp();
        assigned++;
      }
    }

    // İlk 4 level'da MULTI ve FIRE'ın oyunda görülme ihtimalini
    // özellikle garanti altına alıyoruz; sonraki seviyelerde tamamen
    // rastgele dağılıma bırakıyoruz.
    if (lv <= 4 && shuf.length >= 2) {
      const multiIndex = shuf.find(i => !arr[i].pu);
      if (multiIndex !== undefined) arr[multiIndex].pu = "MULTI";

      const fireIndex = shuf.find(i => !arr[i].pu);
      if (fireIndex !== undefined) arr[fireIndex].pu = "FIRE";
    }

    bricksRef.current = arr;
  };

  const makeBall = (x, y, vx, vy) => ({ x, y, vx, vy, trail: [] });

  const syncPrimaryBall = () => {
    const b = ballsRef.current[0];
    if (!b) return;
    bxRef.current = b.x; byRef.current = b.y;
    vxRef.current = b.vx; vyRef.current = b.vy;
    trailRef.current = b.trail;
  };

  const resetBall = (lv = levelRef.current) => {
    const baseSpeed = 2.0 + (lv - 1) * 0.15;
    const sp = frozenRef.current ? baseSpeed * 0.5 : baseSpeed;
    const dir = Math.random() > 0.5 ? 1 : -1;
    ballsRef.current = [makeBall(W / 2, H - 52, dir * sp, -sp)];
    syncPrimaryBall();
  };

  const addMultiBalls = () => {
    const source = ballsRef.current[0];
    if (!source) return;
    const speed = Math.max(2.0, Math.hypot(source.vx, source.vy));
    const angle = Math.atan2(source.vy, source.vx);
    const spread = 0.42;
    ballsRef.current.push(
      makeBall(source.x, source.y, speed * Math.cos(angle - spread), speed * Math.sin(angle - spread)),
      makeBall(source.x, source.y, speed * Math.cos(angle + spread), speed * Math.sin(angle + spread))
    );
    setActivePowerUp("MULTI BALL");

    if (multiTimerRef.current) window.clearTimeout(multiTimerRef.current);
    multiTimerRef.current = window.setTimeout(() => {
      if (ballsRef.current.length > 1) {
        ballsRef.current = [ballsRef.current[0]];
        syncPrimaryBall();
      }
      if (!fireRef.current && !frozenRef.current) setActivePowerUp(null);
    }, 12000);
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
    levelTransitionRef.current = false;
    gsRef.current = "playing";
    scoreSubmittedRef.current = false;
    levelStartLivesRef.current = 4;
    startMission(1);
    maxComboRef.current = 0;
    perfectHitsRef.current = 0;
    perfectFlashRef.current = 0;
    setMaxCombo(0);
    setPerfectHits(0);
    setChainCount(0);
    setLevelTime(0);
    setComboShield(false);
    comboShieldRef.current = false;
    comboShieldUsedRef.current = false;
    chainCountRef.current = 0;
    levelTimeRef.current = 0;
    speedBoostRef.current = 0;
    feverRef.current = false;
    feverUsedRef.current = false;
    feverEndRef.current = 0;
    setFeverMode(false);
    setFeverSeconds(0);
    setFeverActivations(0);
    setEliteHits(0);
    setBossActive(false);
    setBossHp(0);
    setBossMaxHp(0);
    setBricksBrokenRun(0);
    setPowerupsCollectedRun(0);
    setBossesDefeatedRun(0);
    setAchievements({});
    const newChallenge = createRunChallenge();
    challengeRef.current = newChallenge;
    challengeProgressRef.current = 0;
    challengeCompleteRef.current = false;
    setChallenge(newChallenge);
    setChallengeProgress(0);
    setChallengeComplete(false);
    setAchievementPopup(null);
    bricksBrokenRunRef.current = 0;
    powerupsCollectedRunRef.current = 0;
    bossesDefeatedRunRef.current = 0;
    achievementsRef.current = {};
    eliteHitsRef.current = 0;
    bossRef.current = null;
    bossActiveRef.current = false;
    bossPulseRef.current = 0;
    shakeRef.current = 0;
    setPuCounts({ WIDE: 0, FIRE: 0, LIFE: 0, FREEZE: 0, MULTI: 0 }); setActivePowerUp(null);
    pwRef.current = PW; puRef.current = []; frozenRef.current = false; fireRef.current = false;
    if (multiTimerRef.current) window.clearTimeout(multiTimerRef.current);
    multiTimerRef.current = null;
    ballsRef.current = []; trailRef.current = []; ptcRef.current = []; comboRef.current = 0; pausedRef.current = false;
    pxRef.current = (W - PW) / 2; genBricks(1); resetBall(1); setGameState("playing");
  };

  const checkVic = () => {
    if (bossActiveRef.current || levelTransitionRef.current) return;

    if (!bricksRef.current.some(b => b.status > 0)) {
      // Lock immediately because gsRef is updated by React after render.
      // Without this guard, a second animation frame can increment the
      // level again before the "levelup" state is committed.
      levelTransitionRef.current = true;
      gsRef.current = "levelup";
      const clearedLevel = levelRef.current;
      const comboBonus = comboRef.current * 5;
      const levelBonus = 50 + clearedLevel * 10;
      const milestoneBonus = clearedLevel % 5 === 0 ? 100 : 0;
      const survivalBonus = livesRef.current === levelStartLivesRef.current ? 50 : 0;

      if (
        missionRef.current?.type === "survive" &&
        livesRef.current === levelStartLivesRef.current
      ) {
        completeMission();
      }

      const gained = Math.floor(comboBonus + levelBonus + milestoneBonus + survivalBonus);

      audio("levelup");

      scoreRef.current += gained;
      setScore(scoreRef.current);
      setXpGained(gained);
      setPlayerXp(x => x + gained);

      if (milestoneBonus > 0) {
        setComboMessage("MILESTONE!");
        setShowCombo(true);
        window.setTimeout(() => setShowCombo(false), 1000);
      } else if (survivalBonus > 0) {
        setComboMessage("PERFECT!");
        setShowCombo(true);
        window.setTimeout(() => setShowCombo(false), 900);
      }

      setLevel(l => {
        const next = l + 1;
        if (next >= 10) unlockAchievement("level10", "DEEP RUN", "Reached level 10");
        return next;
      });
      setGameState("levelup");
    }
  };

  // ─── Fizik / oyun güncelleme döngüsü ───
  const syncGameplayUI = () => {
    const now = performance.now();
    if (now - uiSyncRef.current < 80) return;
    uiSyncRef.current = now;
    setScore(scoreRef.current);
    setCombo(comboRef.current);
  };

  const playHitSoundThrottled = () => {
    const now = performance.now();
    if (now - lastHitSoundRef.current < 45) return;
    lastHitSoundRef.current = now;
    audio("hit");
  };

  const playBrickSoundThrottled = () => {
    const now = performance.now();
    if (now - lastBrickSoundRef.current < 55) return;
    lastBrickSoundRef.current = now;
    audio("brick");
  };

  const update = () => {
    if (gsRef.current !== "playing" || pausedRef.current) return;

    levelTimeRef.current += 1 / 60;
    if (Math.floor(levelTimeRef.current) !== Math.floor(levelTimeRef.current - 1 / 60)) {
      setLevelTime(Math.floor(levelTimeRef.current));
    }

    const ballR = BR;
    const paddleY = H - PH - 18;

    const targetBoost = Math.min(
      0.25,
      (levelRef.current - 1) * 0.02 +
        Math.min(0.10, levelTimeRef.current / 3600)
    );
    speedBoostRef.current += (targetBoost - speedBoostRef.current) * 0.0025;

    if (feverRef.current) {
      const remaining = Math.max(0, feverEndRef.current - performance.now());
      const seconds = Math.ceil(remaining / 1000);
      if (seconds !== feverSeconds) setFeverSeconds(seconds);

      if (remaining <= 0) {
        feverRef.current = false;
        feverEndRef.current = 0;
        setFeverMode(false);
        setFeverSeconds(0);
      }
    }

    for (let bi = ballsRef.current.length - 1; bi >= 0; bi--) {
      const ball = ballsRef.current[bi];
      ball.x += ball.vx; ball.y += ball.vy;
      const trail = ball.trail;
      if (trail.length >= 14) trail.shift();
      trail.push({ x: ball.x, y: ball.y });

      if (ball.x - ballR <= 0) { ball.x = ballR; ball.vx = Math.abs(ball.vx); playHitSoundThrottled(); }
      if (ball.x + ballR >= W) { ball.x = W - ballR; ball.vx = -Math.abs(ball.vx); playHitSoundThrottled(); }
      if (ball.y - ballR <= 0) { ball.y = ballR; ball.vy = Math.abs(ball.vy); playHitSoundThrottled(); }

      if (ball.vy > 0 && ball.y + ballR >= paddleY && ball.y - ballR <= paddleY + PH && ball.x >= pxRef.current && ball.x <= pxRef.current + pwRef.current) {
        ball.y = paddleY - ballR;
        const center = pxRef.current + pwRef.current / 2;
        const hitPosition = Math.max(-1, Math.min(1, (ball.x - center) / (pwRef.current / 2)));
        const speed = Math.max(2.0, Math.hypot(ball.vx, ball.vy));
        const boostedSpeed = speed * (1 + speedBoostRef.current);
        const angle = hitPosition * 62 * (Math.PI / 180);
        ball.vx = boostedSpeed * Math.sin(angle);
        ball.vy = -Math.abs(boostedSpeed * Math.cos(angle));
        if (Math.abs(ball.vx) < 0.42) ball.vx = hitPosition >= 0 ? 0.42 : -0.42;

        if (Math.abs(hitPosition) <= 0.18) {
          perfectHitsRef.current += 1;
          setPerfectHits(perfectHitsRef.current);
          updateChallenge("perfect", perfectHitsRef.current);
          if (perfectHitsRef.current >= 10) unlockAchievement("perfect10", "PERFECT PLAYER", "10 perfect hits");
          perfectFlashRef.current = 1;

          scoreRef.current += feverRef.current ? 10 : 5;
          setScore(scoreRef.current);

          addFloatText(ball.x, paddleY - 18, "+5 PERFECT", "#ffd34d");
          shakeRef.current = Math.max(shakeRef.current, 2.2);
          setComboMessage("PERFECT HIT!");
          setShowCombo(true);
          window.setTimeout(() => setShowCombo(false), 500);
        }

        playHitSoundThrottled();
      }

      if (bossActiveRef.current && bossRef.current) {
        const boss = bossRef.current;

        boss.x += boss.dir * boss.speed;
        if (boss.x <= 18) {
          boss.x = 18;
          boss.dir = 1;
        }
        if (boss.x + boss.width >= W - 18) {
          boss.x = W - 18 - boss.width;
          boss.dir = -1;
        }

        bossPulseRef.current += 0.08;

        const bossHit =
          ball.x + ballR >= boss.x &&
          ball.x - ballR <= boss.x + boss.width &&
          ball.y + ballR >= boss.y &&
          ball.y - ballR <= boss.y + boss.height;

        if (bossHit) {
          ball.y = boss.y - ballR;
          ball.vy = -Math.abs(ball.vy);

          boss.hp -= 1;
          eliteHitsRef.current += 1;
          setEliteHits(eliteHitsRef.current);
          setBossHp(Math.max(0, boss.hp));

          const bossGain = feverRef.current ? 40 : 20;
          scoreRef.current += bossGain;

          addFloatText(boss.x + boss.width / 2, boss.y + boss.height / 2, `+${bossGain}`, "#ff7ad9");
          addHitFlash(boss.x + boss.width / 2, boss.y + boss.height / 2, "#ff7ad9");
          spawnPtc(boss.x, boss.y, boss.width, boss.height, "#ff7ad9");
          shakeRef.current = Math.max(shakeRef.current, 5);
          playBrickSoundThrottled();

          if (boss.hp <= 0) {
            const reward = 250 + levelRef.current * 25;
            const bossY = boss.y;

            bossRef.current = null;
            bossActiveRef.current = false;
            setBossActive(false);
            setBossHp(0);

            scoreRef.current += reward;
            setScore(scoreRef.current);
            setXpGained(reward);
            setPlayerXp(x => x + reward);
            bossesDefeatedRunRef.current += 1;
            setBossesDefeatedRun(bossesDefeatedRunRef.current);
            updateChallenge("boss", bossesDefeatedRunRef.current);
            unlockAchievement("boss1", "BOSS SLAYER", "Defeated an Elite Core");

            addFloatText(W / 2, bossY, `BOSS DEFEATED +${reward}`, "#ffd34d");
            setComboMessage("BOSS DEFEATED!");
            setShowCombo(true);
            window.setTimeout(() => setShowCombo(false), 1200);
            audio("powerup");
          }

          break;
        }
      }

      for (const brick of bricksRef.current) {
        if (brick.status <= 0) continue;
        const hit = ball.x + ballR >= brick.x && ball.x - ballR <= brick.x + brick.width && ball.y + ballR >= brick.y && ball.y - ballR <= brick.y + brick.height;
        if (!hit) continue;

        const overlapLeft = ball.x + ballR - brick.x;
        const overlapRight = brick.x + brick.width - (ball.x - ballR);
        const overlapTop = ball.y + ballR - brick.y;
        const overlapBottom = brick.y + brick.height - (ball.y - ballR);
        if (!fireRef.current) {
          if (Math.min(overlapLeft, overlapRight) < Math.min(overlapTop, overlapBottom)) ball.vx *= -1;
          else ball.vy *= -1;
        } else {
          ball.x += ball.vx * 0.8; ball.y += ball.vy * 0.8;
        }

        if (brick.status === 3) {
          brick.status = 2;
          comboRef.current += 1;
          setCombo(comboRef.current);
          if (comboRef.current > maxComboRef.current) {
            maxComboRef.current = comboRef.current;
            setMaxCombo(maxComboRef.current);
          }
                  if (comboRef.current >= 15 && !feverUsedRef.current) {
          feverRef.current = true;
          feverUsedRef.current = true;
          feverEndRef.current = performance.now() + 8000;
          setFeverMode(true);
          setFeverSeconds(8);
          setFeverActivations(v => v + 1);

          if (feverTimerRef.current) window.clearTimeout(feverTimerRef.current);
          feverTimerRef.current = window.setTimeout(() => {
            feverRef.current = false;
            feverEndRef.current = 0;
            setFeverMode(false);
            setFeverSeconds(0);
          }, 8000);

          setComboMessage("FEVER MODE!");
          setShowCombo(true);
          window.setTimeout(() => setShowCombo(false), 1100);
          addFloatText(W / 2, H / 2, "2X SCORE", "#ff7ad9");
          shakeRef.current = Math.max(shakeRef.current, 4);
          audio("powerup");
        }

                  if (comboRef.current >= 10 && !comboShieldUsedRef.current) {
          comboShieldRef.current = true;
          comboShieldUsedRef.current = true;
          setComboShield(true);
          setComboMessage("COMBO SHIELD!");
          setShowCombo(true);
          window.setTimeout(() => setShowCombo(false), 850);
          addFloatText(W / 2, H - 72, "SHIELD READY", "#67eaff");
          audio("powerup");
        }

keepComboAlive();
          updateMission(comboRef.current);

          scoreRef.current += feverRef.current ? 40 : 20;
          setScore(scoreRef.current);

          addFloatText(
            brick.x + brick.width / 2,
            brick.y + brick.height / 2,
            "+20",
            "#ffcf5a"
          );
          addHitFlash(
            brick.x + brick.width / 2,
            brick.y + brick.height / 2,
            "#ffd05a"
          );
          shakeRef.current = Math.max(shakeRef.current, 2.5);

          setComboMessage("DENT!");
          setShowCombo(true);
          if (comboMessageTimerRef.current) window.clearTimeout(comboMessageTimerRef.current);
        comboMessageTimerRef.current = window.setTimeout(() => setShowCombo(false), 650);

          playBrickSoundThrottled();
          spawnPtc(brick.x, brick.y, brick.width, brick.height, brick.rc.mid);
          break;
        }

        if (brick.status === 2) {
          brick.status = 1;
          comboRef.current += 1;
          setCombo(comboRef.current);
          if (comboRef.current > maxComboRef.current) {
            maxComboRef.current = comboRef.current;
            setMaxCombo(maxComboRef.current);
          }
          keepComboAlive();
          updateMission(comboRef.current);

          scoreRef.current += feverRef.current ? 30 : 15;
          setScore(scoreRef.current);

          addFloatText(
            brick.x + brick.width / 2,
            brick.y + brick.height / 2,
            "+15",
            "#ffffff"
          );
          addHitFlash(
            brick.x + brick.width / 2,
            brick.y + brick.height / 2,
            brick.rc.mid
          );

          setComboMessage("CRACK!");
          setShowCombo(true);
          if (comboMessageTimerRef.current) window.clearTimeout(comboMessageTimerRef.current);
        comboMessageTimerRef.current = window.setTimeout(() => setShowCombo(false), 650);

          playBrickSoundThrottled();
          spawnPtc(brick.x, brick.y, brick.width, brick.height, brick.rc.mid);
          break;
        }

        brick.status = 0;
        bricksBrokenRef.current += 1;
        bricksBrokenRunRef.current += 1;
        setBricksBrokenRun(bricksBrokenRunRef.current);
        updateChallenge("bricks", bricksBrokenRunRef.current);
        if (bricksBrokenRunRef.current >= 50) unlockAchievement("brick50", "BRICK BREAKER", "Destroyed 50 bricks");
        comboRef.current += 1;
        setCombo(comboRef.current);
        updateChallenge("combo", comboRef.current);
        if (comboRef.current >= 20) unlockAchievement("combo20", "COMBO MASTER", "Reached x20 combo");
        if (comboRef.current > maxComboRef.current) {
          maxComboRef.current = comboRef.current;
          setMaxCombo(maxComboRef.current);
        }
        keepComboAlive();

        const now = performance.now();
        chainCountRef.current = now - lastBrickHitRef.current <= 900
          ? chainCountRef.current + 1
          : 1;
        lastBrickHitRef.current = now;
        setChainCount(chainCountRef.current);

        if (chainTimerRef.current) window.clearTimeout(chainTimerRef.current);
        chainTimerRef.current = window.setTimeout(() => {
          chainCountRef.current = 0;
          setChainCount(0);
        }, 900);

        const chainBonus = Math.max(0, chainCountRef.current - 1) * 3;
        const gained = 10 + Math.max(0, comboRef.current - 1) * 5 + chainBonus;
        const finalGained = feverRef.current ? gained * 2 : gained;
        scoreRef.current += finalGained;
        setScore(scoreRef.current);
        setPlayerXp(x => x + 5);

        const activeMission = missionRef.current;
        if (activeMission?.type === "bricks") {
          updateMission(bricksBrokenRef.current);
        } else if (activeMission?.type === "score") {
          updateMission(scoreRef.current - levelScoreStartRef.current);
        } else if (activeMission?.type === "combo") {
          updateMission(comboRef.current);
        }

        addFloatText(
          brick.x + brick.width / 2,
          brick.y + brick.height / 2,
          `+${finalGained}`,
          feverRef.current ? "#ff7ad9" : comboRef.current >= 5 ? "#ffd34d" : "#67eaff"
        );
        addHitFlash(
          brick.x + brick.width / 2,
          brick.y + brick.height / 2,
          brick.rc.mid
        );
        shakeRef.current = Math.max(shakeRef.current, 3.5);

        const comboTier =
          comboRef.current >= 15 ? "MEGA!" :
          comboRef.current >= 10 ? "SUPER!" :
          comboRef.current >= 5 ? "ON FIRE!" :
          "NICE!";

        setComboMessage(comboTier);
        setShowCombo(true);
        if (comboMessageTimerRef.current) window.clearTimeout(comboMessageTimerRef.current);
        comboMessageTimerRef.current = window.setTimeout(() => setShowCombo(false), 650);

        playBrickSoundThrottled();
        spawnPtc(brick.x, brick.y, brick.width, brick.height, brick.rc.mid);
        if (brick.pu) { puRef.current.push({ x: brick.x + brick.width / 2, y: brick.y + brick.height / 2, type: brick.pu, vy: 1.7 }); brick.pu = null; }
        break;
      }

      if (ball.y - ballR > H) ballsRef.current.splice(bi, 1);
    }

    if (ballsRef.current.length === 0) {
      if (comboShieldRef.current) {
        comboShieldRef.current = false;
        setComboShield(false);
        comboRef.current = Math.max(0, comboRef.current - 2);
        setCombo(comboRef.current);
        chainCountRef.current = 0;
        setChainCount(0);
        trailRef.current = [];
        shakeRef.current = Math.max(shakeRef.current, 8);
        setComboMessage("SAVED!");
        setShowCombo(true);
        window.setTimeout(() => setShowCombo(false), 800);
        addFloatText(W / 2, H - 80, "SHIELD SAVED!", "#67eaff");
        audio("powerup");
        resetBall(levelRef.current);
        return;
      }

      livesRef.current -= 1;
      setLives(livesRef.current);
      audio("lose");
      comboRef.current = 0;
      setCombo(0);
      chainCountRef.current = 0;
      setChainCount(0);
      if (comboTimerRef.current) window.clearTimeout(comboTimerRef.current);
      trailRef.current = [];
      if (livesRef.current <= 0) {
        gsRef.current = "gameover";
        setGameState("gameover");
        if (!scoreSubmittedRef.current) {
          scoreSubmittedRef.current = true;
          submitScore(scoreRef.current, levelRef.current);
        }
        return;
      }
      resetBall(levelRef.current); setActivePowerUp(null);
    }

    for (let i = puRef.current.length - 1; i >= 0; i--) {
      const pu = puRef.current[i]; pu.y += pu.vy || 1.7;
      if (pu.y + 13 >= paddleY && pu.y - 13 <= paddleY + PH && pu.x >= pxRef.current && pu.x <= pxRef.current + pwRef.current) {
        const type = pu.type;
        powerupsCollectedRunRef.current += 1;
        setPowerupsCollectedRun(powerupsCollectedRunRef.current);
        updateChallenge("powerups", powerupsCollectedRunRef.current);
        if (powerupsCollectedRunRef.current >= 5) unlockAchievement("power5", "POWER HUNTER", "Collected 5 power-ups");
        setPuCounts(prev => {
          const next = { ...prev, [type]: (prev[type] || 0) + 1 };
          const activeMission = missionRef.current;
          if (activeMission?.type === "powerups") {
            const totalCollected = Object.values(next).reduce((sum, value) => sum + value, 0);
            window.setTimeout(() => updateMission(totalCollected), 0);
          }
          return next;
        });
        if (type === "WIDE") {
          pwRef.current = Math.min(140, PW + 45); setActivePowerUp("WIDE");
          window.setTimeout(() => { pwRef.current = PW; if (!fireRef.current && !frozenRef.current && ballsRef.current.length < 2) setActivePowerUp(null); }, 6000);
        }
        if (type === "FIRE") {
          fireRef.current = true; setActivePowerUp("FIRE BALL");
          window.setTimeout(() => { fireRef.current = false; if (!frozenRef.current && ballsRef.current.length < 2) setActivePowerUp(null); }, 6000);
        }
        if (type === "MULTI") {
          addMultiBalls();
        }
        if (type === "LIFE") {
          livesRef.current = Math.min(6, livesRef.current + 1); setLives(livesRef.current); setActivePowerUp("EXTRA LIFE");
          window.setTimeout(() => { if (!fireRef.current && !frozenRef.current && ballsRef.current.length < 2) setActivePowerUp(null); }, 1800);
        }
        if (type === "FREEZE" && !frozenRef.current) {
          frozenRef.current = true; ballsRef.current.forEach(b => { b.vx *= 0.5; b.vy *= 0.5; }); setActivePowerUp("SLOW BALL");
          window.setTimeout(() => { frozenRef.current = false; ballsRef.current.forEach(b => { b.vx *= 2; b.vy *= 2; }); if (!fireRef.current && ballsRef.current.length < 2) setActivePowerUp(null); }, 6000);
        }
        audio("powerup"); puRef.current.splice(i, 1); continue;
      }
      if (pu.y > H + 30) puRef.current.splice(i, 1);
    }

    for (let i = ptcRef.current.length - 1; i >= 0; i--) {
      const p = ptcRef.current[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12;
      p.life -= p.decay;
      if (p.life <= 0) ptcRef.current.splice(i, 1);
    }

    for (let i = floatTextRef.current.length - 1; i >= 0; i--) {
      const f = floatTextRef.current[i];
      f.y += f.vy;
      f.life -= 0.035;
      if (f.life <= 0) floatTextRef.current.splice(i, 1);
    }

    for (let i = hitFlashRef.current.length - 1; i >= 0; i--) {
      const f = hitFlashRef.current[i];
      f.radius += 1.15;
      f.life -= 0.075;
      if (f.life <= 0) hitFlashRef.current.splice(i, 1);
    }

    shakeRef.current *= 0.82;
    if (shakeRef.current < 0.08) shakeRef.current = 0;

    perfectFlashRef.current *= 0.84;
    if (perfectFlashRef.current < 0.03) perfectFlashRef.current = 0;

    syncPrimaryBall();
    checkVic();
    syncGameplayUI();
  };

  const doNextLevel = () => {
    if (multiTimerRef.current) window.clearTimeout(multiTimerRef.current);
    multiTimerRef.current = null;
    levelStartLivesRef.current = livesRef.current;
    levelTimeRef.current = 0;
    setLevelTime(0);
    comboShieldRef.current = false;
    comboShieldUsedRef.current = false;
    setComboShield(false);
    feverRef.current = false;
    feverUsedRef.current = false;
    feverEndRef.current = 0;
    setFeverMode(false);
    setFeverSeconds(0);
    startMission(levelRef.current);
    genBricks(levelRef.current);

    const isBossLevel = levelRef.current % 5 === 0;
    if (isBossLevel) {
      const maxHp = 24 + Math.floor(levelRef.current / 5) * 8;
      const bossWidth = Math.min(W - 36, 300);

      bossRef.current = {
        x: (W - bossWidth) / 2,
        y: 105,
        width: bossWidth,
        height: 42,
        hp: maxHp,
        maxHp,
        dir: 1,
        speed: 0.55 + levelRef.current * 0.025,
      };

      bossActiveRef.current = true;
      setBossActive(true);
      setBossHp(maxHp);
      setBossMaxHp(maxHp);
    } else {
      bossRef.current = null;
      bossActiveRef.current = false;
      setBossActive(false);
      setBossHp(0);
      setBossMaxHp(0);
    }
    resetBall(levelRef.current);
    setActivePowerUp(null);
    puRef.current = [];
    frozenRef.current = false;
    fireRef.current = false;
    ptcRef.current = [];
    comboRef.current = 0;
    setCombo(0);
    if (comboTimerRef.current) window.clearTimeout(comboTimerRef.current);
    floatTextRef.current = [];
    hitFlashRef.current = [];
    shakeRef.current = 0;
    bricksBrokenRef.current = 0;
    setIsPaused(false);
    pausedRef.current = false;
    setPuCounts({ WIDE: 0, FIRE: 0, LIFE: 0, FREEZE: 0, MULTI: 0 });
    levelTransitionRef.current = false;
    gsRef.current = "playing";
    setGameState("playing");
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
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.55; ctx.shadowColor = color; ctx.shadowBlur = 4; ctx.stroke();
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
    const drawCracks = (ctx, b) => {
      // Sadece hasar almış 2-hit / 3-hit tuğlalar çatlak gösterir.
      // Normal (1-hit) tuğlalar kesinlikle çatlak çizmez.
      if (b.maxHits === 1) return;
      if (b.maxHits === 2 && b.status !== 1) return;
      if (b.maxHits === 3 && b.status < 2) return;

      const cx = b.x + b.width * 0.5;
      const cy = b.y + b.height * 0.52;

      ctx.save();
      ctx.strokeStyle = "rgba(22,16,34,0.78)";
      ctx.lineWidth = 1.15;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // Ana darbe çatlağı + doğal kılcal dallar
      const cracks = [
        [[cx, cy], [cx - b.width * 0.10, cy - b.height * 0.18], [cx - b.width * 0.19, cy - b.height * 0.40]],
        [[cx - b.width * 0.10, cy - b.height * 0.18], [cx + b.width * 0.08, cy - b.height * 0.35]],
        [[cx - b.width * 0.10, cy - b.height * 0.18], [cx - b.width * 0.25, cy - b.height * 0.10]],
        [[cx, cy], [cx + b.width * 0.08, cy + b.height * 0.18], [cx + b.width * 0.19, cy + b.height * 0.39]],
        [[cx + b.width * 0.08, cy + b.height * 0.18], [cx - b.width * 0.03, cy + b.height * 0.39]],
      ];

      cracks.forEach(points => {
        ctx.beginPath();
        points.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p[0], p[1]);
          else ctx.lineTo(p[0], p[1]);
        });
        ctx.stroke();
      });

      if (b.maxHits === 3 && b.status === 2) {
        ctx.strokeStyle = "rgba(18,14,30,0.52)";
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(cx + b.width * 0.02, cy);
        ctx.lineTo(cx + b.width * 0.20, cy - b.height * 0.25);
        ctx.lineTo(cx + b.width * 0.31, cy - b.height * 0.36);
        ctx.moveTo(cx - b.width * 0.02, cy);
        ctx.lineTo(cx - b.width * 0.18, cy + b.height * 0.22);
        ctx.stroke();
      }

      // Çok hafif açık kenar: çatlağı derin gösterir, neonlaştırmaz.
      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.lineWidth = 0.65;
      ctx.beginPath();
      ctx.moveTo(cx + 1, cy - 1);
      ctx.lineTo(cx - b.width * 0.09, cy - b.height * 0.17);
      ctx.lineTo(cx - b.width * 0.18, cy - b.height * 0.37);
      ctx.stroke();

      ctx.restore();
    };

    const drawBrick = (ctx, b) => {
      if (!b.status) return;

      const { x, y, width: w, height: h, rc } = b;
      const r = 6;

      ctx.save();

      // Tok, doygun renkler. Glow sadece çok hafif kenar ayrımı için.
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, rc.top);
      g.addColorStop(0.45, rc.mid);
      g.addColorStop(1, rc.bot);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.fill();

      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, r);
      ctx.stroke();

      // Sadece kısa bir üst highlight. Eski yoğun parlama kaldırıldı.
      ctx.fillStyle = "rgba(255,255,255,0.10)";
      ctx.beginPath();
      ctx.roundRect(x + 2, y + 2, w - 4, Math.max(2, h * 0.20), 2);
      ctx.fill();

      // Alt kenar gölgesi: tuğlaya fiziksel derinlik verir.
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.beginPath();
      ctx.roundRect(x + 1, y + h * 0.68, w - 2, h * 0.28, [2, 2, r - 1, r - 1]);
      ctx.fill();

      if (b.maxHits === 3) {
        ctx.save();
        ctx.strokeStyle = b.status === 3
          ? "rgba(255,255,255,0.28)"
          : "rgba(255,205,70,0.52)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(x + 2, y + 2, w - 4, h - 4, r - 1);
        ctx.stroke();
        ctx.restore();
      }

      if (b.pu) {
        const icons = { LIFE: "♥", FREEZE: "❄", FIRE: "🔥", WIDE: "↔", MULTI: "3" };
        ctx.save();
        ctx.font = `bold ${Math.floor(h * 0.55)}px sans-serif`;
        ctx.fillStyle = "rgba(255,255,255,0.88)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(icons[b.pu] || "?", x + w / 2, y + h / 2 + 1);
        ctx.restore();
      }

      drawCracks(ctx, b);
      ctx.restore();
    };

    let bgGradient = null;

    const render = () => {
      const cv = canvasRef.current;
      if (!cv) return;
      const ctx = cv.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, W, H);

      const shakeX = shakeRef.current
        ? (Math.random() - 0.5) * shakeRef.current
        : 0;
      const shakeY = shakeRef.current
        ? (Math.random() - 0.5) * shakeRef.current
        : 0;

      ctx.save();
      ctx.translate(shakeX, shakeY);

      if (!bgGradient) {
        bgGradient = ctx.createLinearGradient(0, 0, W, H);
        bgGradient.addColorStop(0, "#07051d");
        bgGradient.addColorStop(0.48, "#11104a");
        bgGradient.addColorStop(1, "#050421");
      }
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, W, H);

      // Derinlik veren yıldızlar
      ctx.save();
      for (let i = 0; i < 62; i++) {
        const x = (i * 97 + 23) % W;
        const y = (i * 71 + 26) % H;
        const r = i % 7 === 0 ? 1.35 : 0.65;
        ctx.globalAlpha = 0.06 + (i % 5) * 0.025;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Oyun alanı çerçevesi
      ctx.save();
      ctx.strokeStyle = "rgba(92,130,255,0.32)";
      ctx.lineWidth = 2;
      ctx.shadowColor = "#3c78ff";
      ctx.shadowBlur = 18;
      ctx.strokeRect(2, 2, W - 4, H - 4);
      ctx.restore();

      bricksRef.current.forEach(b => drawBrick(ctx, b));

      // Kırılma parçacıkları
      ptcRef.current.forEach(p => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.roundRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size, 2);
        ctx.fill();
        ctx.restore();
      });

      // Düşen power-up'lar
      const puColor = { WIDE: "#00d9ff", LIFE: "#ff4f7a", FREEZE: "#65d5ff", FIRE: "#ff9a22", MULTI: "#b56cff" };
      const puIcon = { WIDE: "↔", LIFE: "♥", FREEZE: "❄", FIRE: "🔥", MULTI: "3" };
      puRef.current.forEach(p => {
        const pc = puColor[p.type] || "#ffffff";
        ctx.save();
        ctx.shadowColor = pc;
        ctx.shadowBlur = 18;
        ctx.fillStyle = `${pc}22`;
        ctx.strokeStyle = pc;
        ctx.lineWidth = 1.7;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#fff";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(puIcon[p.type] || "?", p.x, p.y + 0.5);
        ctx.restore();
      });

      // Phase 3 — darbe halkaları
      hitFlashRef.current.forEach(f => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, f.life * 0.75);
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 1.5;
        ctx.shadowColor = f.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      });

      // Phase 3 — yüzen skorlar
      floatTextRef.current.forEach(f => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, f.life);
        ctx.fillStyle = f.color;
        ctx.font = "900 11px Arial Black, Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = f.color;
        ctx.shadowBlur = 4;
        ctx.fillText(f.text, f.x, f.y);
        ctx.restore();
      });

      // Phase 9 — Boss / Elite Core
      if (bossActiveRef.current && bossRef.current) {
        const boss = bossRef.current;
        const pulse = 0.5 + Math.sin(bossPulseRef.current) * 0.5;

        ctx.save();
        ctx.shadowColor = "#ff2fa4";
        ctx.shadowBlur = 12 + pulse * 8;

        const bossGrad = ctx.createLinearGradient(
          boss.x,
          boss.y,
          boss.x,
          boss.y + boss.height
        );
        bossGrad.addColorStop(0, "#6b174f");
        bossGrad.addColorStop(0.5, "#3b123b");
        bossGrad.addColorStop(1, "#210d2b");

        ctx.fillStyle = bossGrad;
        ctx.strokeStyle = "#ff7ad9";
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.roundRect(boss.x, boss.y, boss.width, boss.height, 9);
        ctx.fill();
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.fillStyle = "#ff7ad9";
        ctx.globalAlpha = 0.12 + pulse * 0.08;
        ctx.fillRect(
          boss.x + 3,
          boss.y + 3,
          boss.width - 6,
          boss.height - 6
        );

        ctx.globalAlpha = 1;
        ctx.fillStyle = "#ffd34d";
        ctx.font = "900 11px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(
          `ELITE CORE • ${boss.hp}/${boss.maxHp}`,
          boss.x + boss.width / 2,
          boss.y + boss.height / 2
        );

        ctx.restore();
      }

      // Paddle — her frame yeniden çizilir
      const py = H - PH - 18;
      const p = pxRef.current;
      const pw = pwRef.current;

      ctx.save();
      const perfectGlow = perfectFlashRef.current > 0;
      ctx.shadowColor = perfectGlow
        ? "rgba(255,211,77,0.95)"
        : fireRef.current
          ? "rgba(255,110,30,0.85)"
          : "rgba(40,130,255,0.85)";
      ctx.shadowBlur = perfectGlow ? 34 : 22;

      const leftCap = Math.min(18, pw * 0.16);
      const rightCap = leftCap;

      const body = ctx.createLinearGradient(p, py, p, py + PH);
      body.addColorStop(0, "#ffffff");
      body.addColorStop(0.48, "#dce4ff");
      body.addColorStop(1, "#8b96c8");

      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.roundRect(
        p + leftCap,
        py,
        pw - leftCap - rightCap,
        PH,
        PH / 2
      );
      ctx.fill();

      ctx.fillStyle = fireRef.current ? "#ff8a1c" : "#167eff";
      ctx.beginPath();
      ctx.roundRect(
        p,
        py,
        leftCap * 1.35,
        PH,
        PH / 2
      );
      ctx.roundRect(
        p + pw - rightCap * 1.35,
        py,
        rightCap * 1.35,
        PH,
        PH / 2
      );
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.fillStyle = fireRef.current ? "#ff9d35" : "#37eaff";
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.roundRect(
        p + pw * 0.27,
        py + 5,
        pw * 0.46,
        4,
        2
      );
      ctx.fill();

      if (perfectFlashRef.current > 0) {
        ctx.save();
        ctx.globalAlpha = perfectFlashRef.current * 0.9;
        ctx.strokeStyle = "#ffd34d";
        ctx.lineWidth = 2;
        ctx.shadowColor = "#ffd34d";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.roundRect(p + pw * 0.38, py - 3, pw * 0.24, PH + 6, (PH + 6) / 2);
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();

      // Çoklu toplar ve izleri
      const ballMain = fireRef.current ? "#ff8b20" : frozenRef.current ? "#73d9ff" : "#eef5ff";
      const ballEdge = fireRef.current ? "#ff4b00" : frozenRef.current ? "#299cff" : "#a7b8ff";
      ballsRef.current.forEach(ball => {
        const trail = ball.trail || [];
        for (let i = 1; i < trail.length; i++) {
          const a = i / trail.length, prev = trail[i - 1], cur = trail[i];
          ctx.save(); ctx.globalAlpha = a * 0.22; ctx.strokeStyle = fireRef.current ? "#ff9a22" : frozenRef.current ? "#75dfff" : "#57aaff"; ctx.lineWidth = 1.5 + a * 5; ctx.lineCap = "round"; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 8;
          ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(cur.x, cur.y); ctx.stroke(); ctx.restore();
        }
        ctx.save();
        ctx.shadowColor = ballEdge;
        ctx.shadowBlur = ballsRef.current.length > 1 ? 16 : 22;
        if (ballsRef.current.length > 1) {
          ctx.globalAlpha = 0.42;
          ctx.strokeStyle = ballEdge;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(ball.x, ball.y, BR + 4, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        const bgr = ctx.createRadialGradient(ball.x - 3, ball.y - 4, 1, ball.x, ball.y, BR);
        bgr.addColorStop(0, "#ffffff"); bgr.addColorStop(0.42, ballMain); bgr.addColorStop(1, ballEdge); ctx.fillStyle = bgr;
        ctx.beginPath(); ctx.arc(ball.x, ball.y, BR, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "rgba(255,255,255,0.82)"; ctx.beginPath(); ctx.arc(ball.x - 2.7, ball.y - 3.2, 2.2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      });
      if (ballsRef.current.length > 1) { ctx.save(); ctx.fillStyle = "rgba(255,255,255,0.72)"; ctx.font = "bold 8px sans-serif"; ctx.textAlign = "center"; ctx.fillText(`${ballsRef.current.length} BALLS`, W / 2, H - 8); ctx.restore(); }

      if (pausedRef.current) {
        ctx.save();
        ctx.fillStyle = "rgba(3,2,18,0.72)";
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#ffffff";
        ctx.font = "900 28px Arial Black, Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.shadowColor = "#4d8cff";
        ctx.shadowBlur = 22;
        ctx.fillText("PAUSED", W / 2, H / 2 - 10);
        ctx.font = "12px Arial, sans-serif";
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(255,255,255,0.58)";
        ctx.fillText("Tap ▶ to continue", W / 2, H / 2 + 20);
        ctx.restore();
      }

      ctx.restore();
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
      {achievementPopup && (
        <div style={{ position: "absolute", top: 18, left: "50%", transform: "translateX(-50%)", zIndex: 50, pointerEvents: "none", padding: "10px 16px", minWidth: 190, borderRadius: 13, background: "linear-gradient(135deg, rgba(30,18,55,0.97), rgba(18,12,35,0.97))", border: "1px solid rgba(255,211,77,0.48)", boxShadow: "0 0 30px rgba(255,180,50,0.22)", textAlign: "center" }}>
          <div style={{ color: "#ffd34d", fontSize: 8, fontWeight: 900, letterSpacing: 2 }}>🏆 ACHIEVEMENT UNLOCKED</div>
          <div style={{ color: "#fff", fontSize: 14, fontWeight: 900, marginTop: 3 }}>{achievementPopup.title}</div>
          <div style={{ color: "#9d96c7", fontSize: 9, marginTop: 2 }}>{achievementPopup.detail}</div>
        </div>
      )}

      {(gameState === "playing" || gameState === "gameover") && (
        <div style={{ display: "flex", flexDirection: "column", background: "linear-gradient(180deg, #05041a 0%, #09072b 100%)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 0.8fr 1fr auto", alignItems: "center", gap: 8, padding: "12px 12px 10px", borderBottom: "1px solid rgba(100,120,255,0.14)", background: "rgba(3,3,20,0.78)" }}>
            <div>
              <div style={{ color: "#8eeaff", fontSize: 8, fontWeight: 800, letterSpacing: 1.6 }}>SCORE</div>
              <div style={{ color: "#65eaff", fontSize: 20, fontWeight: 900, lineHeight: 1.1, textShadow: "0 0 16px rgba(0,220,255,0.55)" }}>{score.toLocaleString()}</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ color: "#8f86b8", fontSize: 8, fontWeight: 800, letterSpacing: 1.4 }}>LEVEL</div>
              <div style={{ color: "#ffffff", fontSize: 19, fontWeight: 900, lineHeight: 1.1 }}>{level}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: "#a09ac8", fontSize: 8, fontWeight: 800, letterSpacing: 1.4 }}>BEST</div>
              <div style={{ color: "#ffd44a", fontSize: 18, fontWeight: 900, lineHeight: 1.1, textShadow: "0 0 14px rgba(255,205,55,0.38)" }}>{Math.max(bestScore, score).toLocaleString()}</div>
            </div>
            <button onClick={() => setIsPaused(p => !p)} style={{ width: 40, height: 40, borderRadius: 12, border: "1px solid rgba(70,160,255,0.55)", background: "linear-gradient(145deg, #1779ff, #1836a0)", color: "#fff", fontSize: 18, cursor: "pointer", boxShadow: "0 0 20px rgba(35,125,255,0.42)" }}>{isPaused ? "▶" : "Ⅱ"}</button>
          </div>

          <div style={{ padding: "7px 10px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ color: "#665d96", fontSize: 8, fontWeight: 800, letterSpacing: 2 }}>BASE BRICK BREAKER</div>
            {activePowerUp && <div style={{ color: "#69e7ff", fontSize: 8, fontWeight: 800, letterSpacing: 1, padding: "4px 8px", borderRadius: 8, background: "rgba(0,200,255,0.10)", border: "1px solid rgba(0,200,255,0.28)" }}>{activePowerUp}</div>}
          </div>

          <div style={{ position: "relative", margin: "7px 6px 0", borderRadius: 15, overflow: "hidden", border: "1px solid rgba(95,110,255,0.58)", boxShadow: "0 0 28px rgba(50,90,255,0.18), inset 0 0 28px rgba(0,0,0,0.48)" }}>
            <canvas ref={canvasRef} width={W} height={H} onPointerMove={onMove} onTouchMove={onTouch} onTouchStart={onTouch} style={{ width: "100%", display: "block", touchAction: "none", cursor: "crosshair" }} />

            {showCombo && (
              <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", pointerEvents: "none", textAlign: "center", whiteSpace: "nowrap", padding: "5px 12px", borderRadius: 12, background: comboMessage === "PERFECT HIT!" ? "rgba(255,205,65,0.12)" : "rgba(60,30,110,0.18)", border: `1px solid ${comboMessage === "PERFECT HIT!" ? "rgba(255,211,77,0.48)" : "rgba(180,100,255,0.28)"}`, textShadow: "0 0 18px rgba(80,210,255,0.85)" }}>
                <div style={{ color: comboMessage === "PERFECT HIT!" ? "#ffd34d" : comboMessage === "DENT!" ? "#ffcf5a" : comboMessage === "CRACK!" ? "#7ce9ff" : "#ffffff", fontSize: 11, fontWeight: 900, letterSpacing: 2 }}>{comboMessage}</div>
                {combo > 1 && <div style={{ color: "#ffd34d", fontSize: 18, fontWeight: 900 }}>x{combo} COMBO</div>}
                {chainCount >= 3 && <div style={{ color: "#ff7ad9", fontSize: 9, fontWeight: 900, letterSpacing: 1.5 }}>CHAIN x{chainCount}</div>}
                {feverMode && <div style={{ color: "#ff7ad9", fontSize: 9, fontWeight: 900, letterSpacing: 1.5 }}>2X SCORE ACTIVE</div>}
              </div>
            )}

            {gameState === "gameover" && (
              <div style={{ position: "absolute", inset: 0, background: "rgba(3,2,20,0.93)", backdropFilter: "blur(8px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 15, padding: 20 }}>
                <div style={{ fontWeight: 900, fontSize: 40, letterSpacing: 3, background: "linear-gradient(135deg, #ff5b7d, #ff9c2e, #c45cff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>GAME OVER</div>
                {isNewHigh && <div style={{ color: "#ffd34d", fontWeight: 900, fontSize: 14 }}>🌟 NEW HIGH SCORE!</div>}
                {onchainScoreStatus === "submitting" && <div style={{ color: "#67eaff", fontWeight: 800, fontSize: 10 }}>⛓ SAVING SCORE ON BASE...</div>}
                {onchainScoreStatus === "success" && <div style={{ color: "#8bff9b", fontWeight: 800, fontSize: 10 }}>✓ SCORE SAVED ON BASE</div>}
                {onchainScoreStatus === "error" && <div style={{ color: "#ff8b9b", fontWeight: 800, fontSize: 10 }}>ONCHAIN SAVE FAILED — SUPABASE SCORE KEPT</div>}
                <div style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 7 }}>
                  {[{ l: "SCORE", v: score.toLocaleString(), c: "#63eaff" }, { l: "BEST", v: Math.max(score, bestScore).toLocaleString(), c: "#ffd34d" }, { l: "LEVEL", v: level, c: "#c080ff" }].map(s => (
                    <div key={s.l} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 13, padding: "12px 6px", textAlign: "center" }}>
                      <div style={{ color: "#5d5680", fontSize: 8, fontWeight: 800 }}>{s.l}</div>
                      <div style={{ color: s.c, fontSize: 19, fontWeight: 900, marginTop: 3 }}>{s.v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 5 }}>
                  <button onClick={() => setGameState("menu")} style={{ width: 66, height: 66, borderRadius: "50%", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.22)", color: "#fff", cursor: "pointer", fontSize: 10, fontWeight: 800 }}>🏠<br />HOME</button>
                  <button onClick={startGame} disabled={isPaying} style={{ width: 82, height: 82, borderRadius: "50%", background: "linear-gradient(145deg, #e55cff, #6840ff)", border: "2px solid rgba(255,220,255,0.62)", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 900, boxShadow: "0 0 35px rgba(180,70,255,0.72)" }}>↺<br />RETRY</button>
                  <div style={{ position: "relative" }}>
                    <button onClick={() => setShareMenuOpen(o => !o)} style={{ width: 66, height: 66, borderRadius: "50%", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.22)", color: "#fff", cursor: "pointer", fontSize: 10, fontWeight: 800 }}>📤<br />SHARE</button>
                    <ShareMenu />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "0.9fr 1.4fr 0.9fr", gap: 7, padding: "8px 10px", background: "#070622" }}>
            <div style={{ border: "1px solid rgba(100,100,255,0.28)", borderRadius: 12, padding: "8px 5px", textAlign: "center", background: "rgba(10,10,45,0.72)" }}>
              <div style={{ color: "#ffd34d", fontSize: 16 }}>★</div>
              <div style={{ color: "#8e86b8", fontSize: 7, fontWeight: 800, letterSpacing: 1 }}>COMBO</div>
              <div style={{ color: "#ffd34d", fontSize: 16, fontWeight: 900 }}>x{combo}</div>
            </div>
            <div style={{ border: `1px solid ${showCombo ? "rgba(220,70,255,0.72)" : "rgba(110,80,255,0.28)"}`, borderRadius: 12, padding: "8px 5px", textAlign: "center", background: showCombo ? "rgba(150,50,220,0.16)" : "rgba(10,10,45,0.72)", boxShadow: showCombo ? "0 0 18px rgba(200,70,255,0.24)" : "none", transition: "all .2s" }}>
              <div style={{ color: "#e87cff", fontSize: 9, fontWeight: 900, letterSpacing: 1.5 }}>{showCombo ? comboMessage : combo > 1 ? "STREAK" : "KEEP GOING"}</div>
              <div style={{ color: "#67eaff", fontSize: 16, fontWeight: 900 }}>{combo > 1 ? `x${combo} COMBO` : "BREAK BRICKS"}</div>
              {combo > 1 && <div style={{ marginTop: 5, height: 3, borderRadius: 4, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: showCombo ? "100%" : "28%", background: "linear-gradient(90deg,#67eaff,#e87cff)", transition: "width .2s" }} />
              </div>}
            </div>
            <div style={{ border: "1px solid rgba(255,80,120,0.28)", borderRadius: 12, padding: "8px 5px", textAlign: "center", background: "rgba(10,10,45,0.72)" }}>
              <div style={{ fontSize: 17 }}>❤️</div>
              <div style={{ color: "#8e86b8", fontSize: 7, fontWeight: 800, letterSpacing: 1 }}>LIVES</div>
              <div style={{ color: "#ff6688", fontSize: 15, fontWeight: 900 }}>{lives}</div>
            </div>
          </div>

          <div style={{ background: "linear-gradient(180deg, #0c0a2a 0%, #08061e 100%)", borderTop: "1px solid rgba(100,110,255,0.28)", padding: "9px 10px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
              <div style={{ margin: "8px 0 9px", padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(103,234,255,0.16)", background: "rgba(8,10,36,0.78)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div>
                    <div style={{ color: missionComplete ? "#ffd34d" : "#67eaff", fontSize: 8, fontWeight: 900, letterSpacing: 1.7 }}>
                      {missionComplete ? "MISSION COMPLETE!" : "MISSION"}
                    </div>
                    <div style={{ color: "#fff", fontSize: 10, fontWeight: 900, marginTop: 3 }}>
                      {mission.label} {mission.type === "survive" ? "" : `${mission.progress}/${mission.target}`}
                    </div>
                  </div>
                  <div style={{ color: "#ffd34d", fontSize: 11, fontWeight: 900 }}>+{mission.reward}</div>
                </div>
                {mission.type !== "survive" && (
                  <div style={{ marginTop: 6, height: 4, borderRadius: 5, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(100, (mission.progress / mission.target) * 100)}%`, background: "linear-gradient(90deg,#67eaff,#e87cff)", transition: "width .2s" }} />
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                <div style={{ flex: 1, padding: "6px 7px", borderRadius: 8, background: comboShield ? "rgba(103,234,255,0.12)" : "rgba(255,255,255,0.035)", border: `1px solid ${comboShield ? "rgba(103,234,255,0.42)" : "rgba(255,255,255,0.07)"}` }}>
                  <div style={{ color: "#6c65a0", fontSize: 7, fontWeight: 900, letterSpacing: 1.2 }}>SHIELD</div>
                  <div style={{ color: comboShield ? "#67eaff" : "#514b7b", fontSize: 9, fontWeight: 900, marginTop: 2 }}>{comboShield ? "READY" : "—"}</div>
                </div>
                <div style={{ flex: 1, padding: "6px 7px", borderRadius: 8, background: chainCount >= 3 ? "rgba(255,122,217,0.10)" : "rgba(255,255,255,0.035)", border: `1px solid ${chainCount >= 3 ? "rgba(255,122,217,0.35)" : "rgba(255,255,255,0.07)"}` }}>
                  <div style={{ color: "#6c65a0", fontSize: 7, fontWeight: 900, letterSpacing: 1.2 }}>CHAIN</div>
                  <div style={{ color: chainCount >= 3 ? "#ff7ad9" : "#8b84b0", fontSize: 9, fontWeight: 900, marginTop: 2 }}>x{chainCount}</div>
                </div>
                <div style={{ flex: 1, padding: "6px 7px", borderRadius: 8, background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div style={{ color: "#6c65a0", fontSize: 7, fontWeight: 900, letterSpacing: 1.2 }}>TIME</div>
                  <div style={{ color: "#8bff9b", fontSize: 9, fontWeight: 900, marginTop: 2 }}>{levelTime}s</div>
                </div>
              </div>

              {challenge && (
                <div style={{
                  marginBottom: 8, padding: "8px 9px", borderRadius: 9,
                  background: challengeComplete ? "rgba(255,211,77,0.10)" : "rgba(103,234,255,0.055)",
                  border: `1px solid ${challengeComplete ? "rgba(255,211,77,0.45)" : "rgba(103,234,255,0.20)"}`
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ color: challengeComplete ? "#ffd34d" : "#67eaff", fontSize: 8, fontWeight: 900, letterSpacing: 1.5 }}>
                      {challengeComplete ? "✓ CHALLENGE COMPLETE" : "◆ RUN CHALLENGE"}
                    </div>
                    <div style={{ color: "#8b84b0", fontSize: 8, fontWeight: 900 }}>+{challenge.reward}</div>
                  </div>
                  <div style={{ color: "#d9d5ed", fontSize: 10, fontWeight: 900, marginTop: 3 }}>{challenge.title}</div>
                  <div style={{ color: "#77709d", fontSize: 8, marginTop: 2 }}>{challenge.detail}</div>
                  <div style={{ marginTop: 5, height: 4, borderRadius: 5, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      width: `${challenge.target ? (challengeProgress / challenge.target) * 100 : 0}%`,
                      background: challengeComplete ? "#ffd34d" : "#67eaff",
                      transition: "width .15s"
                    }} />
                  </div>
                  <div style={{ color: "#8b84b0", fontSize: 7, fontWeight: 800, marginTop: 3, textAlign: "right" }}>
                    {challengeProgress}/{challenge.target}
                  </div>
                </div>
              )}

              {bossActive && (
                <div style={{ marginBottom: 8, padding: "8px 9px", borderRadius: 9, background: "rgba(255,47,164,0.09)", border: "1px solid rgba(255,122,217,0.42)", boxShadow: "0 0 18px rgba(255,47,164,0.14)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ color: "#ff7ad9", fontSize: 8, fontWeight: 900, letterSpacing: 1.6 }}>⚡ ELITE CORE</div>
                    <div style={{ color: "#ffd34d", fontSize: 10, fontWeight: 900 }}>{bossHp}/{bossMaxHp}</div>
                  </div>
                  <div style={{ marginTop: 5, height: 5, borderRadius: 5, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${bossMaxHp ? (bossHp / bossMaxHp) * 100 : 0}%`, background: "linear-gradient(90deg,#ff2fa4,#ffd34d)", transition: "width .12s" }} />
                  </div>
                </div>
              )}

              {feverMode && (
                <div style={{ marginBottom: 8, padding: "7px 9px", borderRadius: 9, background: "rgba(255,70,190,0.10)", border: "1px solid rgba(255,122,217,0.42)", boxShadow: "0 0 18px rgba(255,70,190,0.16)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ color: "#ff7ad9", fontSize: 8, fontWeight: 900, letterSpacing: 1.8 }}>🔥 FEVER MODE</div>
                    <div style={{ color: "#ffd34d", fontSize: 10, fontWeight: 900 }}>2X • {feverSeconds}s</div>
                  </div>
                  <div style={{ marginTop: 5, height: 3, borderRadius: 4, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(100, (feverSeconds / 8) * 100)}%`, background: "linear-gradient(90deg,#ff7ad9,#ffd34d)", transition: "width .2s" }} />
                  </div>
                </div>
              )}

              <div style={{ color: "#6c65a0", fontSize: 8, fontWeight: 900, letterSpacing: 2.5 }}>POWER-UPS</div>
              <button onClick={() => setIsMuted(m => !m)} style={{ background: "none", border: "none", color: "#77709e", fontSize: 15, cursor: "pointer" }}>{isMuted ? "🔇" : "🎵"}</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
              {[
                { k: "WIDE", ic: "↔", lb: "EXPAND", c: "#00d9ff" },
                { k: "FIRE", ic: "🔥", lb: "FIRE", c: "#ff9825" },
                { k: "MULTI", ic: "3", lb: "MULTI", c: "#b56cff" },
                { k: "LIFE", ic: "♥", lb: "EXTRA LIFE", c: "#ff4f7a" },
                { k: "FREEZE", ic: "❄", lb: "SLOW", c: "#65d5ff" },
              ].map(pu => {
                const active = puCounts[pu.k] > 0;
                return (
                  <div key={pu.k} style={{ borderRadius: 11, padding: "7px 4px 6px", textAlign: "center", background: active ? `${pu.c}12` : "rgba(255,255,255,0.025)", border: `1px solid ${active ? `${pu.c}80` : "rgba(255,255,255,0.07)"}`, boxShadow: active ? `0 0 15px ${pu.c}22` : "none" }}>
                    <div style={{ width: 34, height: 34, margin: "0 auto 4px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: pu.c, fontSize: 20, fontWeight: 900, background: active ? `${pu.c}18` : "rgba(255,255,255,0.035)", opacity: active ? 1 : 0.45 }}>{pu.ic}</div>
                    <div style={{ color: active ? pu.c : "#4a426e", fontSize: 12, fontWeight: 900 }}>{puCounts[pu.k]}</div>
                    <div style={{ color: active ? `${pu.c}aa` : "#373152", fontSize: 6.5, fontWeight: 800, whiteSpace: "nowrap" }}>{pu.lb}</div>
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
          <div style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
            {[
              { l: "SCORE", v: score.toLocaleString(), c: "#fff" },
              { l: "XP GAINED", v: `+${xpGained} XP`, c: "#a070ff" },
              { l: "BEST COMBO", v: `x${maxCombo}`, c: "#ffd34d" },
              { l: "PERFECT HITS", v: perfectHits, c: "#67eaff" },
              { l: "BEST CHAIN", v: `x${chainCount}`, c: "#ff7ad9" },
              { l: "TIME", v: `${levelTime}s`, c: "#8bff9b" },
              { l: "FEVER", v: `${feverActivations}x`, c: "#ff7ad9" },
              { l: "BOSS HITS", v: eliteHits, c: "#ff7ad9" },
              { l: "BRICKS", v: bricksBrokenRun, c: "#67eaff" },
              { l: "POWER-UPS", v: powerupsCollectedRun, c: "#8bff9b" },
              { l: "CHALLENGE", v: challengeComplete ? "DONE" : `${challengeProgress}/${challenge?.target ?? 0}`, c: "#ffd34d" }
            ].map(s => (
              <div key={s.l} style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.11)", borderRadius: 15, padding: "12px 7px", textAlign: "center" }}>
                <div style={{ color: "#484068", fontSize: 9, fontWeight: 700, letterSpacing: 1.5 }}>{s.l}</div>
                <div style={{ color: s.c, fontWeight: 900, fontSize: 30, marginTop: 4 }}>{s.v}</div>
              </div>
            ))}
          </div>
          <div style={{ color: "#8b84b0", fontSize: 9, fontWeight: 800, letterSpacing: 1.1, textAlign: "center" }}>
            ACHIEVEMENTS {Object.keys(achievements).length}/6
          </div>
          <div style={{ color: missionComplete ? "#ffd34d" : "#756d9f", fontSize: 10, fontWeight: 800, letterSpacing: 1.2, textAlign: "center" }}>
            {missionComplete ? `MISSION COMPLETE • +${mission.reward}` : `MISSION: ${mission.label}`}
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
