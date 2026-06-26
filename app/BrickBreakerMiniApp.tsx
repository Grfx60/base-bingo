"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { useAccount } from "wagmi";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const FIXED_WIDTH = 400;
const FIXED_HEIGHT = 500;
const PADDLE_WIDTH = 80;
const PADDLE_HEIGHT = 12;
const BALL_RADIUS = 8;

interface Brick {
  x: number;
  y: number;
  width: number;
  height: number;
  status: number;
  type: "normal" | "double" | "triple" | "speed" | "slow" | "wide" | "narrow" | "laser" | "magnet";
  color: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  color: string;
  size: number;
}

interface Laser {
  x: number;
  y: number;
}

interface LeaderboardRow {
  id?: string;
  wallet_address: string;
  score: number;
  level_reached?: number;
  week_str?: string;
}

export default function BrickBreakerMiniApp() {
  const { address } = useAccount();
  const userWallet = address || "Guest";

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // --- OYUN PARAMETRELERİ / STATE'LER ---
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [lives, setLives] = useState(4);
  const [gameState, setGameState] = useState<"menu" | "playing" | "gameover" | "victory">("menu");
  const [isMuted, setIsMuted] = useState(false);

  // Modlar: "tournament" veya "practice"
  const [gameMode, setGameMode] = useState<"tournament" | "practice">("tournament");

  // Kullanıcı İstatistikleri
  const [playerLv, setPlayerLv] = useState(1);
  const [playerXp, setPlayerXp] = useState(0);
  const [streak, setStreak] = useState(0);

  // Hak ve Zaman Yönetimi
  const [attemptsLeft, setAttemptsLeft] = useState(3);
  const [countdownStr, setCountdownStr] = useState("");
  const [currentWeekStr, setCurrentWeekStr] = useState("");
  const [weeklyRank, setWeeklyRank] = useState<number | string>("—");
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);

  // Güvenlik ve Hile Koruması
  const [clientSessionId, setClientSessionId] = useState("");
  const [actionLog, setActionLog] = useState<string[]>([]);

  // Seçili Görünüm (Skin)
  const [selectedSkin, setSelectedSkin] = useState("Default");

  // --- REFS (Animasyon ve Gerçek Zamanlı Hesaplamalar İçin) ---
  const scoreRef = useRef(0);
  const levelRef = useRef(1);
  const livesRef = useRef(4);
  const gameStateRef = useRef<"menu" | "playing" | "gameover" | "victory">("menu");
  const gameModeRef = useRef<"tournament" | "practice">("tournament");

  const paddleXRef = useRef((FIXED_WIDTH - PADDLE_WIDTH) / 2);
  const paddleWidthRef = useRef(PADDLE_WIDTH);
  const ballXRef = useRef(FIXED_WIDTH / 2);
  const ballYRef = useRef(FIXED_HEIGHT - 30);
  const ballVxFRef = useRef(3);
  const ballVyFRef = useRef(-3);
  const baseSpeedRef = useRef(4);

  const bricksRef = useRef<Brick[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const lasersRef = useRef<Laser[]>([]);

  // Güçlendirici (Power-up) Durumları
  const activePowerUpRef = useRef<string | null>(null);
  const powerUpTimerRef = useRef<number>(0);
  const isMagnetAttachedRef = useRef(false);

  // Kontroller
  const rightPressedRef = useRef(false);
  const leftPressedRef = useRef(false);

  // --- REFS FOR STATS (To prevent recreation of functions) ---
  const playerLvRef = useRef(1);
  const playerXpRef = useRef(0);
  const streakRef = useRef(0);

  // --- LOCAL REFS SENKRONİZASYONU ---
  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { levelRef.current = level; }, [level]);
  useEffect(() => { livesRef.current = lives; }, [lives]);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
  useEffect(() => { gameModeRef.current = gameMode; }, [gameMode]);
  useEffect(() => { playerLvRef.current = playerLv; }, [playerLv]);
  useEffect(() => { playerXpRef.current = playerXp; }, [playerXp]);
  useEffect(() => { streakRef.current = streak; }, [streak]);

  // --- AUDIO SİSTEMİ ---
  const playAudio = useCallback((type: "hit" | "brick" | "powerup" | "lose" | "victory" | "laser") => {
    if (isMuted) return;
    try {
      const windowObj = window as Window & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
      const AudioCtx = windowObj.AudioContext || windowObj.webkitAudioContext;
      if (!AudioCtx) return;
      
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === "hit") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(150, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        osc.start(); osc.stop(ctx.currentTime + 0.1);
      } else if (type === "brick") {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(300, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
        osc.start(); osc.stop(ctx.currentTime + 0.08);
      } else if (type === "powerup") {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.start(); osc.stop(ctx.currentTime + 0.15);
      } else if (type === "laser") {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(200, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        osc.start(); osc.stop(ctx.currentTime + 0.1);
      } else if (type === "lose") {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(200, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(80, ctx.currentTime + 0.4);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.start(); osc.stop(ctx.currentTime + 0.4);
      } else if (type === "victory") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(400, ctx.currentTime);
        osc.frequency.setValueAtTime(600, ctx.currentTime + 0.1);
        osc.frequency.setValueAtTime(800, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.start(); osc.stop(ctx.currentTime + 0.4);
      }
    } catch (e) {
      console.error(e);
    }
  }, [isMuted]);

  // --- ZAMAN VE HAFTA HESAPLAMA ---
  const getUTCWeekString = useCallback(() => {
    const d = new Date();
    const utcTarget = new Date(d.valueOf() + d.getTimezoneOffset() * 60000);
    utcTarget.setDate(utcTarget.getDate() + 4 - (utcTarget.getDay() || 7));
    const yearStart = new Date(utcTarget.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((utcTarget.valueOf() - yearStart.valueOf()) / 86400000) + 1) / 7);
    return `${utcTarget.getFullYear()}-W${weekNo < 10 ? "0" + weekNo : weekNo}`;
  }, []);

  // --- VERİTABANI VE PROFIL YÜKLEME ---
  const loadProfileAndLeaderboard = useCallback(async () => {
    if (!userWallet || userWallet === "Guest") return;
    const currentWeek = getUTCWeekString();

    // 1. Profil veya İstatistik Yükleme
    const { data: prof } = await supabase
      .from("player_profiles")
      .select("*")
      .eq("wallet_address", userWallet)
      .single();

    if (prof) {
      setPlayerLv(prof.level || 1);
      setPlayerXp(prof.xp || 0);
      setStreak(prof.streak || 0);
    } else {
      await supabase.from("player_profiles").insert([{ wallet_address: userWallet, level: 1, xp: 0, streak: 0 }]);
    }

    // 2. Günlük Hak Kontrolü
    const todayStr = new Date().toISOString().split("T")[0];
    const { data: att } = await supabase
      .from("player_attempts")
      .select("*")
      .eq("wallet_address", userWallet)
      .eq("date_str", todayStr)
      .single();

    if (att) {
      setAttemptsLeft(Math.max(0, 3 - att.count));
    } else {
      setAttemptsLeft(3);
    }

    // 3. Liderlik Tablosu Yükleme
    const { data: lb } = await supabase
      .from("brick_breaker_scores")
      .select("*")
      .eq("week_str", currentWeek)
      .order("score", { ascending: false })
      .limit(10);

    if (lb) {
      setLeaderboard(lb);
      const myIndex = lb.findIndex((r) => r.wallet_address === userWallet);
      setWeeklyRank(myIndex !== -1 ? myIndex + 1 : "10+");
    }
  }, [userWallet, getUTCWeekString]);

  // --- SKOR KAYDETME VE SEVİYE ATLAMA ---
  const saveTournamentScore = useCallback(async (finalScore: number) => {
    if (!userWallet || userWallet === "Guest" || gameModeRef.current !== "tournament") return;
    const todayStr = new Date().toISOString().split("T")[0];
    const currentWeek = getUTCWeekString();

    try {
      // Hak Düşürme İşlemi
      const { data: att } = await supabase
        .from("player_attempts")
        .select("*")
        .eq("wallet_address", userWallet)
        .eq("date_str", todayStr)
        .single();

      if (att) {
        await supabase.from("player_attempts").update({ count: att.count + 1 }).eq("id", att.id);
      } else {
        await supabase.from("player_attempts").insert([{ wallet_address: userWallet, date_str: todayStr, count: 1 }]);
      }

      // Skoru Veritabanına Yazma
      await supabase.from("brick_breaker_scores").insert([
        {
          wallet_address: userWallet,
          score: finalScore,
          level_reached: levelRef.current,
          week_str: currentWeek,
          session_id: clientSessionId,
          verification_log: actionLog,
        },
      ]);

      // XP ve Profil Güncelleme
      const gainedXp = finalScore * 2;
      let newXp = playerXpRef.current + gainedXp;
      let newLv = playerLvRef.current;
      const xpNeeded = playerLvRef.current * 500;

      if (newXp >= xpNeeded) {
        newXp -= xpNeeded;
        newLv += 1;
      }

      await supabase
        .from("player_profiles")
        .update({ level: newLv, xp: newXp, streak: streakRef.current + 1 })
        .eq("wallet_address", userWallet);

      loadProfileAndLeaderboard();
    } catch (err) {
      console.error("Skor kaydedilirken hata oluştu:", err);
    }
  }, [userWallet, clientSessionId, actionLog, getUTCWeekString, loadProfileAndLeaderboard]);

  useEffect(() => {
    setCurrentWeekStr(getUTCWeekString());
    setClientSessionId(Math.random().toString(36).substring(2, 15));

    const timer = setInterval(() => {
      const now = new Date();
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const diff = tomorrow.getTime() - now.getTime();

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);

      setCountdownStr(
        `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
      );
    }, 1000);

    return () => clearInterval(timer);
  }, [getUTCWeekString]);

  useEffect(() => {
    loadProfileAndLeaderboard();
  }, [loadProfileAndLeaderboard]);

  // --- PARÇACIK EFEKTİ (PARTICLES) ---
  const createBrickExplosion = (bx: number, by: number, color: string) => {
    for (let i = 0; i < 8; i++) {
      particlesRef.current.push({
        x: bx + 20,
        y: by + 10,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
        alpha: 1,
        color: color,
        size: Math.random() * 3 + 2,
      });
    }
  };

  // --- TUĞLA OLUŞTURMA ALGORİTMASI ---
  const generateBricks = (lvl: number) => {
    const rows = 4 + Math.min(lvl, 3);
    const cols = 6;
    const padding = 6;
    const offsetTop = 40;
    const offsetLeft = 12;
    const bWidth = (FIXED_WIDTH - offsetLeft * 2 - padding * (cols - 1)) / cols;
    const bHeight = 16;

    const types: Brick["type"][] = ["normal", "double", "triple", "speed", "slow", "wide", "narrow", "laser", "magnet"];
    const arr: Brick[] = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let t: Brick["type"] = "normal";
        const rand = Math.random();

        if (rand > 0.6) {
          t = types[Math.floor(Math.random() * types.length)];
        }

        let hp = 1;
        let color = "#3b82f6"; // Mavi

        if (t === "double") { hp = 2; color = "#a855f7"; } // Mor
        if (t === "triple") { hp = 3; color = "#ef4444"; } // Kırmızı
        if (t === "speed") color = "#eab308";  // Sarı
        if (t === "slow") color = "#06b6d4";   // Turkuaz
        if (t === "wide") color = "#10b981";   // Yeşil
        if (t === "narrow") color = "#f97316"; // Turuncu
        if (t === "laser") color = "#ec4899";  // Pembe
        if (t === "magnet") color = "#6366f1"; // İndigo

        arr.push({
          x: c * (bWidth + padding) + offsetLeft,
          y: r * (bHeight + padding) + offsetTop,
          width: bWidth,
          height: bHeight,
          status: hp,
          type: t,
          color: color,
        });
      }
    }
    bricksRef.current = arr;
  };

  // --- OYUNU BAŞLATMA ---
  const startGame = () => {
    if (gameMode === "tournament" && attemptsLeft <= 0) {
      alert("Günlük turnuva hakkınız kalmadı! Antrenman modunda oynayabilirsiniz.");
      return;
    }
    setScore(0);
    setLevel(1);
    setLives(4);
    setActionLog([`start_${gameMode}_${Date.now()}`]);

    paddleXRef.current = (FIXED_WIDTH - PADDLE_WIDTH) / 2;
    paddleWidthRef.current = PADDLE_WIDTH;

    generateBricks(1);
    resetBall();

    activePowerUpRef.current = null;
    powerUpTimerRef.current = 0;
    isMagnetAttachedRef.current = false;
    lasersRef.current = [];
    particlesRef.current = [];

    setGameState("playing");
  };

  const resetBall = () => {
    ballXRef.current = FIXED_WIDTH / 2;
    ballYRef.current = FIXED_HEIGHT - 35;
    ballVxFRef.current = (Math.random() > 0.5 ? 1 : -1) * (baseSpeedRef.current - 1);
    ballVyFRef.current = -baseSpeedRef.current;
    isMagnetAttachedRef.current = false;
  };

  // --- INPUT / KLAVYE KONTROLLERİ ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Right" || e.key === "ArrowRight") rightPressedRef.current = true;
      if (e.key === "Left" || e.key === "ArrowLeft") leftPressedRef.current = true;
      if (e.key === " " && isMagnetAttachedRef.current && gameStateRef.current === "playing") {
        isMagnetAttachedRef.current = false;
        ballVyFRef.current = -baseSpeedRef.current;
        ballVxFRef.current = (Math.random() - 0.5) * 4;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Right" || e.key === "ArrowRight") rightPressedRef.current = false;
      if (e.key === "Left" || e.key === "ArrowLeft") leftPressedRef.current = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // MOUSE / DOKUNMATIK KONTROLLER
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (gameState !== "playing" || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = FIXED_WIDTH / rect.width;
    const clientX = e.clientX;
    const canvasX = (clientX - rect.left) * scaleX;
    paddleXRef.current = Math.max(0, Math.min(FIXED_WIDTH - paddleWidthRef.current, canvasX - paddleWidthRef.current / 2));
  };

  const handlePointerDown = () => {
    if (gameState === "playing" && isMagnetAttachedRef.current) {
      isMagnetAttachedRef.current = false;
      ballVyFRef.current = -baseSpeedRef.current;
      ballVxFRef.current = (Math.random() - 0.5) * 4;
    }
  };

  // --- OYUN DÖNGÜSÜ (GAME LOOP) ---
  useEffect(() => {
    let animId: number;

    const triggerPowerUp = (type: Brick["type"]) => {
      playAudio("powerup");
      activePowerUpRef.current = type;
      if (type === "speed") {
        ballVxFRef.current *= 1.4;
        ballVyFRef.current *= 1.4;
      } else if (type === "slow") {
        ballVxFRef.current *= 0.7;
        ballVyFRef.current *= 0.7;
      } else if (type === "wide") {
        paddleWidthRef.current = PADDLE_WIDTH * 1.5;
        setTimeout(() => { paddleWidthRef.current = PADDLE_WIDTH; }, 8000);
      } else if (type === "narrow") {
        paddleWidthRef.current = PADDLE_WIDTH * 0.6;
        setTimeout(() => { paddleWidthRef.current = PADDLE_WIDTH; }, 8000);
      } else if (type === "laser") {
        powerUpTimerRef.current = 6000; // 6 Saniye Lazer Süresi
      } else if (type === "magnet") {
        // Bir sonraki palette top yapışacak
      }
    };

    const update = () => {
      if (gameStateRef.current !== "playing") return;

      // 1. Palet Hareketi
      if (rightPressedRef.current) {
        paddleXRef.current = Math.min(FIXED_WIDTH - paddleWidthRef.current, paddleXRef.current + 6);
      }
      if (leftPressedRef.current) {
        paddleXRef.current = Math.max(0, paddleXRef.current - 6);
      }

      // Magnet Güçlendiricisi Aktifse Topu Palete Kilitle
      if (isMagnetAttachedRef.current) {
        ballXRef.current = paddleXRef.current + paddleWidthRef.current / 2;
        ballYRef.current = FIXED_HEIGHT - PADDLE_HEIGHT - BALL_RADIUS - 4;
      } else {
        // Top Hareketi
        ballXRef.current += ballVxFRef.current;
        ballYRef.current += ballVyFRef.current;
      }

      // 2. Duvar Çarpmaları
      if (ballXRef.current + BALL_RADIUS > FIXED_WIDTH || ballXRef.current - BALL_RADIUS < 0) {
        ballVxFRef.current = -ballVxFRef.current;
        playAudio("hit");
      }
      if (ballYRef.current - BALL_RADIUS < 0) {
        ballVyFRef.current = -ballVyFRef.current;
        playAudio("hit");
      }

      // 3. Palete Çarpma Kontrolü
      if (
        ballVyFRef.current > 0 &&
        ballYRef.current + BALL_RADIUS >= FIXED_HEIGHT - PADDLE_HEIGHT - 4 &&
        ballXRef.current >= paddleXRef.current &&
        ballXRef.current <= paddleXRef.current + paddleWidthRef.current
      ) {
        playAudio("hit");
        if (activePowerUpRef.current === "magnet") {
          isMagnetAttachedRef.current = true;
        } else {
          let hitPoint = ballXRef.current - (paddleXRef.current + paddleWidthRef.current / 2);
          hitPoint = hitPoint / (paddleWidthRef.current / 2);
          ballVxFRef.current = hitPoint * baseSpeedRef.current;
          ballVyFRef.current = -Math.sqrt(Math.max(4, baseSpeedRef.current ** 2 - ballVxFRef.current ** 2));
        }
      }

      // 4. Aşağı Düşme (Can Kaybı)
      if (ballYRef.current - BALL_RADIUS > FIXED_HEIGHT) {
        playAudio("lose");
        const nextLives = livesRef.current - 1;
        setLives(nextLives);
        if (nextLives <= 0) {
          setGameState("gameover");
          saveTournamentScore(scoreRef.current);
        } else {
          resetBall();
        }
      }

      // 5. Lazer Ateş Mekanizması
      if (activePowerUpRef.current === "laser") {
        powerUpTimerRef.current -= 16.66;
        if (Math.random() < 0.03) {
          lasersRef.current.push({ x: paddleXRef.current + 10, y: FIXED_HEIGHT - 20 });
          lasersRef.current.push({ x: paddleXRef.current + paddleWidthRef.current - 10, y: FIXED_HEIGHT - 20 });
          playAudio("laser");
        }
        if (powerUpTimerRef.current <= 0) activePowerUpRef.current = null;
      }

      // Lazerleri İlerlet ve Tuğla Çarpmalarını Hesapla
      lasersRef.current = lasersRef.current.filter((l) => {
        l.y -= 7;
        let lHit = false;
        bricksRef.current.forEach((b) => {
          if (b.status > 0 && l.x >= b.x && l.x <= b.x + b.width && l.y >= b.y && l.y <= b.y + b.height) {
            lHit = true;
            b.status -= 1;
            setScore((s) => s + 15);
            createBrickExplosion(b.x, b.y, b.color);
          }
        });
        return !lHit && l.y > 0;
      });

      // 6. Tuğla Çarpmaları (Top İle)
      let allCleared = true;
      bricksRef.current.forEach((b, idx) => {
        if (b.status <= 0) return;
        allCleared = false;

        if (
          ballXRef.current + BALL_RADIUS >= b.x &&
          ballXRef.current - BALL_RADIUS <= b.x + b.width &&
          ballYRef.current + BALL_RADIUS >= b.y &&
          ballYRef.current - BALL_RADIUS <= b.y + b.height
        ) {
          b.status -= 1;
          setScore((s) => s + 10);
          playAudio("brick");
          createBrickExplosion(b.x, b.y, b.color);

          // Çarpma Açısını Hesapla ve Yön Değiştir
          const overlapX = Math.min(ballXRef.current + BALL_RADIUS - b.x, b.x + b.width - (ballXRef.current - BALL_RADIUS));
          const overlapY = Math.min(ballYRef.current + BALL_RADIUS - b.y, b.y + b.height - (ballYRef.current - BALL_RADIUS));

          if (overlapX < overlapY) {
            ballVxFRef.current = -ballVxFRef.current;
          } else {
            ballVyFRef.current = -ballVyFRef.current;
          }

          // Tuğla Kırılınca Güçlendirici Tetikleme
          if (b.status === 0 && b.type !== "normal" && b.type !== "double" && b.type !== "triple") {
            triggerPowerUp(b.type);
          }

          setActionLog((prev) => [...prev, `hit_${idx}_${scoreRef.current}_${Date.now()}`]);
        }
      });

      // Seviye Atlama / Zafer Kontrolü
      if (allCleared) {
        playAudio("victory");
        const nextLvl = levelRef.current + 1;
        if (nextLvl > 4) {
          setGameState("victory");
          saveTournamentScore(scoreRef.current + 500); // Zafer Bonusu
        } else {
          setLevel(nextLvl);
          generateBricks(nextLvl);
          resetBall();
        }
      }

      // Parçacıkları Güncelle (Patlama Efekti)
      particlesRef.current = particlesRef.current.filter((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= 0.02;
        return p.alpha > 0;
      });
    };

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, FIXED_WIDTH, FIXED_HEIGHT);

      // Tematik Arka Plan Çizimi (Neon Grid Tasarımı)
      ctx.fillStyle = "#0f172a"; // Koyu Slate
      ctx.fillRect(0, 0, FIXED_WIDTH, FIXED_HEIGHT);

      ctx.strokeStyle = "rgba(51, 65, 85, 0.3)";
      ctx.lineWidth = 1;
      for (let i = 0; i < FIXED_WIDTH; i += 40) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, FIXED_HEIGHT); ctx.stroke();
      }
      for (let j = 0; j < FIXED_HEIGHT; j += 40) {
        ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(FIXED_WIDTH, j); ctx.stroke();
      }

      // Tuğlaları Çiz
      bricksRef.current.forEach((b) => {
        if (b.status <= 0) return;
        ctx.fillStyle = b.color;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(b.x, b.y, b.width, b.height, 4);
        } else {
          ctx.rect(b.x, b.y, b.width, b.height);
        }
        ctx.fill();

        // Cam/Işıltı Efekti
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.fillRect(b.x, b.y, b.width, b.height / 3);
      });

      // Paleti Çiz (Skin Seçimine Göre)
      ctx.fillStyle = selectedSkin === "Gold" ? "#f59e0b" : selectedSkin === "Mint" ? "#10b981" : "#3b82f6";
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(paddleXRef.current, FIXED_HEIGHT - PADDLE_HEIGHT - 4, paddleWidthRef.current, PADDLE_HEIGHT, 6);
      } else {
        ctx.rect(paddleXRef.current, FIXED_HEIGHT - PADDLE_HEIGHT - 4, paddleWidthRef.current, PADDLE_HEIGHT);
      }
      ctx.fill();

      // Topu Çiz (Neon Efektli)
      ctx.shadowBlur = 10;
      ctx.shadowColor = "#f43f5e";
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(ballXRef.current, ballYRef.current, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0; // Gölgeyi sıfırla

      // Lazerleri Çiz
      ctx.fillStyle = "#f43f5e";
      lasersRef.current.forEach((l) => {
        ctx.fillRect(l.x, l.y, 3, 10);
      });

      // Efekt Parçacıklarını Çiz
      particlesRef.current.forEach((p) => {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    };

    const loop = () => {
      update();
      render();
      animId = requestAnimationFrame(loop);
    };

    if (gameState === "playing") {
      animId = requestAnimationFrame(loop);
    } else {
      render();
    }

    return () => cancelAnimationFrame(animId);
  }, [gameState, selectedSkin, playAudio, saveTournamentScore]);

  // --- DIGER ARAYÜZ FONKSİYONLARI ---
  const switchMode = () => {
    setGameMode((m) => (m === "tournament" ? "practice" : "tournament"));
  };

  const resetPractice = () => {
    if (gameMode === "practice") startGame();
  };

  const shareScore = () => {
    const text = `Base-Bingo Tuğla Kırma Oyununda ${score} skor ürettim! Gel ve rekorumu kır! 🚀`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
  };

  const renderHeartLives = () => {
    return "💜".repeat(Math.max(0, lives));
  };

  return (
    <div className="w-full max-w-md mx-auto p-4 bg-slate-950 border border-slate-800 rounded-3xl text-white text-sm space-y-4 shadow-2xl">
      
      {/* 1. BAŞLIK VE SKOR ALANI */}
      <div className="flex justify-between items-center border-b border-slate-800/80 pb-3">
        <div>
          <h1 className="text-xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400">
            BRICK BREAKER
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[11px] text-slate-500 font-medium">Phase-2 (No mint)</span>
            <button 
              onClick={() => setIsMuted(!isMuted)} 
              className="text-xs text-slate-400 hover:text-white"
            >
              {isMuted ? "🔇" : "🔊"}
            </button>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-purple-400 font-bold mb-0.5 tracking-tight">
            {renderHeartLives() || <span className="text-red-500 font-bold">ELENDİ</span>}
          </div>
          <div className="text-xs font-semibold text-slate-400">
            SCORE: <span className="text-white text-base font-black text-emerald-400">{score}</span>
          </div>
        </div>
      </div>

      {/* 2. OYUN ALANI (CANVAS) */}
      <div className="relative flex justify-center bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-inner">
        <canvas
          ref={canvasRef}
          width={FIXED_WIDTH}
          height={FIXED_HEIGHT}
          onPointerMove={handlePointerMove}
          onPointerDown={handlePointerDown}
          className="w-full h-auto max-w-full block touch-none cursor-crosshair"
        />

        {/* Oyun Durum Katmanları (Overlay) */}
        {gameState !== "playing" && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center space-y-4">
            {gameState === "menu" && (
              <>
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-blue-400">Oyuna Başla</h3>
                  <p className="text-xs text-slate-400 max-w-xs">
                    Mevcut Mod: <strong className="text-white uppercase text-amber-400">{gameMode}</strong>
                  </p>
                </div>
                <button
                  onClick={startGame}
                  className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 font-bold rounded-xl shadow-lg transition-transform active:scale-95 text-sm w-48"
                >
                  OYUNU BAŞLAT
                </button>
              </>
            )}

            {gameState === "gameover" && (
              <>
                <div className="space-y-1">
                  <h3 className="text-xl font-black text-red-500 tracking-wide">GAME OVER</h3>
                  <p className="text-xs text-slate-400">Tüm canlarınız tükendi.</p>
                  <p className="text-sm font-bold text-slate-200">Toplam Skor: <span className="text-emerald-400 text-lg font-black">{score}</span></p>
                </div>
                <button
                  onClick={startGame}
                  className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 font-semibold rounded-xl text-xs w-40"
                >
                  Tekrar Dene
                </button>
              </>
            )}

            {gameState === "victory" && (
              <>
                <div className="space-y-1">
                  <h3 className="text-xl font-black text-emerald-400 tracking-wide">TEBRİKLER! 🎉</h3>
                  <p className="text-xs text-slate-400">Tüm seviyeleri başarıyla temizlediniz.</p>
                  <p className="text-sm font-bold text-slate-200">Final Skoru: <span className="text-amber-400 text-lg font-black">{score}</span></p>
                </div>
                <button
                  onClick={startGame}
                  className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 font-bold rounded-xl text-xs w-40"
                >
                  Yeni Başarıya Koş
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* 3. OYUNCU BİLGİ KARTLARI (Kompakt Grid Yapı) */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-slate-900/60 p-2 rounded-xl border border-slate-800/80">
          <span className="text-slate-500 block text-[10px] mb-0.5 font-bold uppercase">Player Stats</span>
          <span className="font-extrabold text-blue-400">LV {playerLv}</span>
          <span className="text-slate-400 mx-1.5">•</span>
          <span className="text-slate-300 font-mono">{playerXp} XP</span>
        </div>
        <div className="bg-slate-900/60 p-2 rounded-xl border border-slate-800/80 flex justify-between items-center">
          <div>
            <span className="text-slate-500 block text-[10px] mb-0.5 font-bold uppercase">Level</span>
            <span className="font-extrabold text-purple-400">LV {level}</span>
          </div>
          <div className="text-right">
            <span className="text-slate-500 block text-[10px] mb-0.5 font-bold uppercase">Streak</span>
            <span className="font-extrabold text-amber-500">🔥 {streak}</span>
          </div>
        </div>
      </div>

      {/* 4. DENEME VE KONTROL PANELİ (Tek Satır) */}
      <div className="bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/60 text-xs text-slate-400 space-y-1.5">
        <div className="flex justify-between items-center">
          <span className="font-medium">Attempts Left: <strong className="text-white font-mono bg-slate-800 px-1.5 py-0.5 rounded text-xs">{attemptsLeft}/3</strong></span>
          {attemptsLeft <= 0 ? (
            <span className="text-red-400 font-bold bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20 text-[11px]">Daily attempts bitti.</span>
          ) : (
            <span className="text-emerald-400 font-semibold text-[11px]">Turnuvaya Hazır</span>
          )}
        </div>
        <div className="flex justify-between text-[10px] text-slate-500 border-t border-slate-800/50 pt-1.5 font-medium">
          <span>Drag / ←→ • Space: Magnet Release</span>
          <span>Tap: Launch Ball</span>
        </div>
      </div>

      {/* 5. TURNUVA DURUMU VE REFRESH SÜRESİ */}
      <div className="flex justify-between items-center text-xs bg-indigo-500/5 border border-indigo-500/10 p-2.5 rounded-xl text-slate-400">
        <div>
          <span className="block text-[10px] text-slate-500 font-bold uppercase">Weekly Tournament</span>
          <span className="text-slate-200 font-bold font-mono text-[11px]">{currentWeekStr || "2026-W26"}</span>
          <span className="text-slate-600 mx-1">•</span>
          <span className="text-slate-400 font-medium">Rank: <strong className="text-white font-mono">#{weeklyRank}</strong></span>
        </div>
        <div className="text-right">
          <span className="block text-[10px] text-slate-500 font-bold uppercase">Next Reset (TR)</span>
          <span className="text-amber-400 font-mono font-bold tracking-wider">{countdownStr || "00:00:00"}</span>
        </div>
      </div>

      {/* 6. AKSİYON BUTONLARI */}
      <div className="flex gap-2 text-xs">
        <button
          onClick={switchMode}
          className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 font-semibold rounded-xl transition-all active:scale-95 text-center text-slate-300"
        >
          {gameMode === "tournament" ? "🏆 Switch to Practice" : "🏆 Switch to Tournament"}
        </button>
        
        {gameMode === "practice" ? (
          <button
            onClick={resetPractice}
            className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 font-semibold rounded-xl transition-all border border-slate-700 text-center text-white"
          >
            Reset Level 🔄
          </button>
        ) : (
          <button
            onClick={shareScore}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 font-bold rounded-xl transition-all active:scale-95 text-center shadow-lg shadow-blue-500/10 text-white"
          >
            Share Challenge 📤
          </button>
        )}
      </div>

      {/* 7. SKOR TABLOSU & SKIN SEÇENEKLERİ (Sekme Mantığı) */}
      <div className="bg-slate-900/30 p-2.5 rounded-xl border border-slate-800 text-xs space-y-2">
        <div className="flex justify-between items-center border-b border-slate-800/60 pb-1.5">
          <span className="font-bold text-slate-400 tracking-wide">Top 10 Leaderboard</span>
          {/* Görünüm Değiştirici */}
          <div className="flex gap-1.5 text-[10px]">
            <button 
              onClick={() => setSelectedSkin("Default")} 
              className={`px-1.5 py-0.5 rounded ${selectedSkin === "Default" ? "bg-blue-500 font-bold text-white" : "text-slate-500"}`}
            >
              Neon
            </button>
            <button 
              onClick={() => playerLv >= 4 ? setSelectedSkin("Gold") : alert("LV 4 kilitli!")} 
              className={`px-1.5 py-0.5 rounded ${selectedSkin === "Gold" ? "bg-amber-500 font-bold text-slate-950" : "text-slate-500"}`}
            >
              Gold (LV 4)
            </button>
            <button 
              onClick={() => playerLv >= 8 ? setSelectedSkin("Mint") : alert("LV 8 kilitli!")} 
              className={`px-1.5 py-0.5 rounded ${selectedSkin === "Mint" ? "bg-emerald-500 font-bold text-slate-950" : "text-slate-500"}`}
            >
              Mint (LV 8)
            </button>
          </div>
        </div>

        {leaderboard.length === 0 ? (
          <p className="text-slate-600 text-center py-2 italic font-medium">No scores yet. Be the first!</p>
        ) : (
          <div className="max-h-24 overflow-y-auto space-y-1 font-mono text-[11px] pr-1">
            {leaderboard.map((row, idx) => (
              <div key={row.id || idx} className="flex justify-between py-0.5 border-b border-slate-900/50 last:border-0">
                <span className="text-slate-400">
                  <strong className="text-slate-500 mr-1">#{idx + 1}</strong>
                  {row.wallet_address?.slice(0, 6)}...{row.wallet_address?.slice(-4)}
                </span>
                <span className="font-bold text-emerald-400">{row.score} pts</span>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}