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
  { top: "#ffe070", mid: "#ffd200", bot: "#997a00", shine: "rgba(255,250,200,0.7)" },
  { top: "#70ffb0", mid: "#00e676", bot: "#008a47", shine: "rgba(200,255,230,0.7)" },
  { top: "#70d0ff", mid: "#00b0ff", bot: "#006999", shine: "rgba(200,240,255,0.7)" },
  { top: "#d080ff", mid: "#aa00ff", bot: "#660099", shine: "rgba(240,210,255,0.7)" },
];

export default function BrickBreakerMiniApp() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { sendTransactionAsync } = useSendTransaction();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [gameState, setGameState] = useState<"IDLE" | "PLAYING" | "GAMEOVER" | "WIN">("IDLE");
  const [score, setScore] = useState(0);
  const [highScores, setHighScores] = useState<any[]>([]);
  const [isPaying, setIsPaying] = useState(false);

  // Mutable game ref to avoid React re-render lags
  const gameRef = useRef({
    px: (W - PW) / 2,
    bx: W / 2,
    by: H - 40,
    bvx: 4,
    bvy: -4,
    bricks: [] as any[],
    particles: [] as any[], // Temizlenen parçacık dizisi
    score: 0,
    keys: { Left: false, Right: false },
  });

  // Fetch leaderboard
  const fetchLeaderboard = async () => {
    try {
      const { data, error } = await supabase
        .from("brick_breaker_scores")
        .select("*")
        .order("score", { ascending: false })
        .limit(5);
      if (!error && data) setHighScores(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  // Set up brick grid
  const initBricks = () => {
    const rows = 5;
    const cols = 6;
    const padding = 6;
    const offsetTop = 45;
    const offsetLeft = 8;
    const bw = (W - offsetLeft * 2 - (cols - 1) * padding) / cols;
    const bh = 18;

    const arr = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        arr.push({
          x: offsetLeft + c * (bw + padding),
          y: offsetTop + r * (bh + padding),
          w: bw,
          h: bh,
          hp: 1,
          colorObj: ROW_COLORS[r % ROW_COLORS.length],
        });
      }
    }
    gameRef.current.bricks = arr;
  };

  // Launch Game after successful transaction or free play
  const startGame = async () => {
    if (isPaying) return;
    setIsPaying(true);

    try {
      if (isConnected) {
        // Optional Base TX Payment Integration
        const tx = await sendTransactionAsync({
          to: GAME_FEE_RECIPIENT,
          value: GAME_FEE_AMOUNT,
        });
        console.log("Tx success:", tx);
      }
    } catch (err) {
      console.warn("Payment rejected or failed. Starting free trial mode.");
    }

    // Reset game engine values
    const g = gameRef.current;
    g.px = (W - PW) / 2;
    g.bx = W / 2;
    g.by = H - 50;
    const angle = (Math.random() * 0.4 + 0.3) * Math.PI; 
    g.bvx = 5 * Math.cos(angle) * (Math.random() > 0.5 ? 1 : -1);
    g.bvy = -5 * Math.sin(angle);
    g.score = 0;
    g.particles = []; // Önceki oyundan kalanları sıfırla
    initBricks();

    setScore(0);
    setGameState("PLAYING");
    setIsPaying(false);
  };

  // Save score to database
  const saveScore = async (finalScore: number) => {
    if (finalScore <= 0) return;
    const userAddr = address || "Anonymous Mage";
    try {
      await supabase.from("brick_breaker_scores").insert([{ wallet: userAddr, score: finalScore }]);
      fetchLeaderboard();
    } catch (e) {
      console.error(e);
    }
  };

  // Track key presses
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") gameRef.current.keys.Left = true;
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") gameRef.current.keys.Right = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") gameRef.current.keys.Left = false;
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") gameRef.current.keys.Right = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // Main Core Engine Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const g = gameRef.current;

      // BACKGROUND RENDER
      ctx.fillStyle = "#0c0817";
      ctx.fillRect(0, 0, W, H);

      // Cyber grid background aesthetic effect
      ctx.strokeStyle = "rgba(130, 80, 255, 0.05)";
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 30) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += 30) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      if (gameState === "PLAYING") {
        // PADDLE LOGIC & MOVEMENT
        if (g.keys.Left) g.px = Math.max(0, g.px - 7);
        if (g.keys.Right) g.px = Math.min(W - PW, g.px + 7);

        // BALL MOVEMENT
        g.bx += g.bvx;
        g.by += g.bvy;

        // WALL COLLISIONS
        if (g.bx - BR < 0) { g.bx = BR; g.bvx = -g.bvx; }
        if (g.bx + BR > W) { g.bx = W - BR; g.bvx = -g.bvx; }
        if (g.by - BR < 0) { g.by = BR; g.bvy = -g.bvy; }

        // PADDLE COLLISION
        if (g.by + BR >= H - 25 && g.by - BR <= H - 25 + PH) {
          if (g.bx >= g.px && g.bx <= g.px + PW) {
            g.by = H - 25 - BR;
            const hitPoint = (g.bx - (g.px + PW / 2)) / (PW / 2); // -1 to 1 range
            const speed = Math.sqrt(g.bvx * g.bvx + g.bvy * g.bvy);
            g.bvx = hitPoint * 5;
            g.bvy = -Math.sqrt(Math.max(9, speed * speed - g.bvx * g.bvx));
          }
        }

        // BRICK COLLISION DETECTOR
        let aliveBricks = 0;
        for (let i = 0; i < g.bricks.length; i++) {
          const b = g.bricks[i];
          if (b.hp <= 0) continue;
          aliveBricks++;

          // Check if ball intersects brick bounding box
          if (g.bx + BR > b.x && g.bx - BR < b.x + b.w && g.by + BR > b.y && g.by - BR < b.y + b.h) {
            b.hp--;
            g.score += 100;
            setScore(g.score);

            // 🚀 PARÇACIK OLUŞTURMA: Tuğla kırılınca neon parçalar saç
            const pColor = b.colorObj.mid;
            for (let k = 0; k < 12; k++) {
              g.particles.push({
                x: b.x + b.w / 2,
                y: b.y + b.h / 2,
                vx: (Math.random() - 0.5) * 6,
                vy: (Math.random() - 0.3) * 5 + 1,
                size: Math.random() * 3 + 2,
                alpha: 1, // Görünür başla
                color: pColor,
              });
            }

            // Simple vertical bounce inversion
            g.bvy = -g.bvy;
            break; 
          }
        }

        // WIN CONDITION CHECK
        if (aliveBricks === 0) {
          setGameState("WIN");
          saveScore(g.score);
        }

        // GAME OVER CHECK
        if (g.by - BR > H) {
          setGameState("GAMEOVER");
          saveScore(g.score);
        }
      }

      // 🧱 TUĞLALARI ÇİZ
      g.bricks.forEach((b) => {
        if (b.hp <= 0) return;
        const c = b.colorObj;

        // 3D Cyber design build
        ctx.fillStyle = c.bot;
        ctx.fillRect(b.x, b.y, b.w, b.h);

        ctx.fillStyle = c.mid;
        ctx.fillRect(b.x, b.y, b.w, b.h - 3);

        ctx.fillStyle = c.top;
        ctx.fillRect(b.x, b.y, b.w, 2);

        // Highlight sheen
        ctx.fillStyle = c.shine;
        ctx.fillRect(b.x + 2, b.y + 2, b.w - 4, 2);
      });

      // 🏓 PADDLE'I ÇİZ
      ctx.save();
      ctx.shadowBlur = 15;
      ctx.shadowColor = "#00f5ff";
      const paddleGrad = ctx.createLinearGradient(g.px, H - 25, g.px + PW, H - 25);
      paddleGrad.addColorStop(0, "#00f5ff");
      paddleGrad.addColorStop(0.5, "#0077ff");
      paddleGrad.addColorStop(1, "#00f5ff");
      ctx.fillStyle = paddleGrad;
      ctx.beginPath();
      ctx.roundRect(g.px, H - 25, PW, PH, 6);
      ctx.fill();
      ctx.restore();

      // 🟡 TOPU ÇİZ
      if (gameState === "PLAYING") {
        ctx.save();
        ctx.shadowBlur = 12;
        ctx.shadowColor = "#ff00a0";
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(g.bx, g.by, BR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // =================================================================
      // 🚀 YENİLENEN TEMİZ PARÇACIK SİSTEMİ (HAFIZA SIZINTISI ENGELLENDİ)
      // =================================================================
      
      // 1. Filtreleme: Şeffaflığı biten (alpha <= 0) parçaları diziden atarak RAM'i temizler.
      g.particles = g.particles.filter((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= 0.025; // Her karede sönümleme miktarı
        return p.alpha > 0;
      });

      // 2. Çizim: Aktif parçacıkları parlama efekti ile render et
      g.particles.forEach((p) => {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.shadowBlur = 8;
        ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
        ctx.restore();
      });
      
      // =================================================================

      // HUD / ÜST PANEL BİLGİSİ
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "900 13px 'Courier New', Courier, monospace";
      ctx.fillText(`SCORE: ${g.score.toLocaleString()}`, 16, 26);

      if (isConnected) {
        ctx.fillStyle = "#00f5ff";
        ctx.font = "900 10px sans-serif";
        ctx.fillText(`🌐 BASE ACTIVE`, W - 110, 24);
      }

      // GAME OVER / IDLE / WIN EKRAN YAZILARI
      if (gameState === "IDLE") {
        ctx.fillStyle = "rgba(10, 5, 25, 0.75)";
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#ff00a0";
        ctx.font = "900 24px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("BASE BRICK BREAKER", W / 2, H / 2 - 20);
        ctx.fillStyle = "#d0d0e0";
        ctx.font = "12px sans-serif";
        ctx.fillText("Ready to smash blocks on-chain?", W / 2, H / 2 + 10);
      } else if (gameState === "GAMEOVER") {
        ctx.fillStyle = "rgba(20, 0, 10, 0.85)";
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#ff2d78";
        ctx.font = "900 28px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("GAME OVER", W / 2, H / 2 - 10);
        ctx.fillStyle = "#ffffff";
        ctx.font = "14px sans-serif";
        ctx.fillText(`FINAL SCORE: ${g.score}`, W / 2, H / 2 + 20);
      } else if (gameState === "WIN") {
        ctx.fillStyle = "rgba(0, 20, 15, 0.85)";
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#00e676";
        ctx.font = "900 28px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("VICTORY! 🎉", W / 2, H / 2 - 10);
        ctx.fillStyle = "#ffffff";
        ctx.font = "14px sans-serif";
        ctx.fillText(`SCORE: ${g.score}`, W / 2, H / 2 + 20);
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [gameState, isConnected]);

  return (
    <div style={{ maxWidth: 410, margin: "0 auto", background: "#0c081c", borderRadius: 24, overflow: "hidden", fontFamily: "sans-serif", color: "#fff", boxShadow: "0 20px 50px rgba(0,0,0,0.6)", border: "1px solid #20153b" }}>
      
      {/* HEADER / WALLET STATUS */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", background: "linear-gradient(to bottom, #140d2e, #0c081c)", borderBottom: "1px solid #1c123a" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 10, h: 10, borderRadius: "50%", background: isConnected ? "#00e676" : "#ff3366", boxShadow: isConnected ? "0 0 10px #00e676" : "none" }} />
          <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.5, color: "#a090cc" }}>
            {isConnected ? "CONNECTED" : "ARCADE MODE"}
          </span>
        </div>
        
        {isConnected ? (
          <button onClick={() => disconnect()} style={{ background: "rgba(255,50,100,0.15)", border: "1px solid rgba(255,50,100,0.3)", color: "#ff5077", padding: "6px 12px", borderRadius: 10, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
            {address?.slice(0, 6)}...{address?.slice(-4)} ✕
          </button>
        ) : (
          <button onClick={() => connect({ connector: connectors[0] })} style={{ background: "linear-gradient(135deg, #0052ff, #0077ff)", border: "none", color: "#fff", padding: "7px 14px", borderRadius: 12, fontSize: 11, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 12px rgba(0,82,255,0.3)" }}>
            🔌 CONNECT WALLET
          </button>
        )}
      </div>

      {/* ARCADE SCREEN SCREEN */}
      <div style={{ position: "relative", padding: "10px 10px 4px", display: "flex", justifyContent: "center" }}>
        <canvas ref={canvasRef} width={W} height={H} style={{ borderRadius: 16, display: "block", boxShadow: "inset 0 0 20px rgba(0,0,0,0.8)" }} />
      </div>

      {/* FOOTER & BUTTON ACTIONS */}
      <div style={{ background: "#0c0817", paddingTop: 4 }}>
        {gameState !== "PLAYING" && (
          <div style={{ padding: "0 16px 12px" }}>
            <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 16, padding: 12, border: "1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#70609a", marginBottom: 8, letterSpacing: 0.5 }}>🏆 TOP ALPHA PLAYERS</div>
              {highScores.length === 0 ? (
                <div style={{ fontSize: 11, color: "#403560", fontStyle: "italic" }}>No entries yet. Be the first!</div>
              ) : (
                highScores.map((h, idx) => (
                  <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0", borderBottom: idx < highScores.length - 1 ? "1px solid rgba(255,255,255,0.02)" : "none" }}>
                    <span style={{ color: idx === 0 ? "#ffe070" : "#c0b0e0", fontFamily: "monospace" }}>
                      {idx + 1}. {h.wallet.slice(0, 10)}...
                    </span>
                    <span style={{ fontWeight: 900, color: "#00f5ff" }}>{h.score.toLocaleString()}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* CURRENT USER STATE METRIC */}
        {isConnected && address && gameState !== "PLAYING" && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "0 16px 10px", padding: "10px 14px", background: "rgba(130,80,255,0.07)", border: "1px solid rgba(130,80,255,0.15)", borderRadius: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 18, height: 18, borderRadius: 6, background: "#8250ff", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: 10 }}>{address.slice(2, 4).toUpperCase()}</div>
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
            <button disabled style={{ width: "100%", padding: 14, borderRadius: 16, fontWeight: 900, fontSize: 13, letterSpacing: 1, border: "1px solid #20153b", background: "#110b24", color: "#50407a" }}>
              🚀 BOOST
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}