"use client";

import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useEffect, useMemo, useRef, useState } from "react";


type Cell = {
  id: string;
  pos: number; // 0..8
  text: string;
  done: boolean;
};

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

const TASK_POOL = [
  "Bugün 1 mini app aç",
  "Feed’de 1 post beğen",
  "Bir arkadaşına paylaş",
  "Profiline bak",
  "1 yorum bırak",
  "Bugün 1 yeni hesap takip et",
  "Bir postu kaydet",
  "1 dakika keşfet",
  "Bugün geri gel (streak)",
  "Bir mini app’e oy ver",
  "Bir postu repost et",
  "Bir arkadaş etiketle",
];

export default function Home() {
  const miniKit = useMiniKit();
  const user =
  (miniKit as unknown as { user?: unknown }).user ??
  (miniKit as unknown as { context?: { user?: unknown } }).context?.user;


  const address = user?.address;

  // Client hesaplanan anahtarlar
  const [dateKey, setDateKey] = useState<string>("");
  const [seedKey, setSeedKey] = useState<string>("guest:");
  const [storageKey, setStorageKey] = useState<string>("");

  // Streak
  const [streak, setStreak] = useState<number>(0);

  // "Bu storageKey için load yaptım mı?" bayrağı
  const loadedKeyRef = useRef<string | null>(null);

  // 1) dateKey / seedKey / storageKey hesapla (client)
  useEffect(() => {
    const d = todayKey();
    const seed = `${address ?? "guest"}:${d}`;
    setDateKey(d);
    setSeedKey(seed);
    setStorageKey(`base-bingo:${seed}`);
  }, [address]);

  // 2) Günlük kartı üret (seedKey'ye bağlı)
  const initialCells = useMemo<Cell[]>(() => {
    let seed = 0;
    for (let i = 0; i < seedKey.length; i++) {
      seed = (seed * 31 + seedKey.charCodeAt(i)) >>> 0;
    }

    const pick = (n: number) => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed % n;
    };

    const chosen: string[] = [];
    while (chosen.length < 9) {
      const t = TASK_POOL[pick(TASK_POOL.length)];
      if (!chosen.includes(t)) chosen.push(t);
    }

    return chosen.map((text, idx) => ({
      id: `${seedKey}-${idx}`,
      pos: idx,
      text,
      done: false,
    }));
  }, [seedKey]);

  // 3) Cells state
  const [cells, setCells] = useState<Cell[]>([]);

  // 4) storageKey hazır olunca: o anahtar için localStorage'dan yükle (her storageKey değişiminde 1 kez)
  useEffect(() => {
    if (!storageKey) return;

    // aynı storageKey için tekrar tekrar yüklemeyelim
    if (loadedKeyRef.current === storageKey) return;

    const saved = localStorage.getItem(storageKey);
    if (!saved) {
      setCells(initialCells);
      loadedKeyRef.current = storageKey;
      return;
    }

    try {
      const parsed = JSON.parse(saved) as Cell[];
      const normalized: Cell[] = parsed.map((c, i) => ({
        id: String(c.id ?? `${seedKey}-${i}`),
        pos: typeof c.pos === "number" ? c.pos : i,
        text: String(c.text ?? initialCells[i]?.text ?? ""),
        done: Boolean(c.done),
      }));
      setCells(normalized);
    } catch {
      setCells(initialCells);
    } finally {
      loadedKeyRef.current = storageKey;
    }
  }, [storageKey, initialCells, seedKey]);

  // 5) Streak hesapla (adres varsa)
  useEffect(() => {
    if (!address) return;
    if (!dateKey) return;

    const streakKey = `base-bingo:streak:${address}`;
    const raw = localStorage.getItem(streakKey);

    if (!raw) {
      localStorage.setItem(streakKey, JSON.stringify({ lastDate: dateKey, count: 1 }));
      setStreak(1);
      return;
    }

    try {
      const data = JSON.parse(raw) as { lastDate: string; count: number };

      if (data.lastDate === dateKey) {
        setStreak(data.count);
        return;
      }

      const last = new Date(data.lastDate);
      const curr = new Date(dateKey);
      const diffDays = (curr.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);

      if (diffDays === 1) {
        const next = data.count + 1;
        localStorage.setItem(streakKey, JSON.stringify({ lastDate: dateKey, count: next }));
        setStreak(next);
      } else {
        localStorage.setItem(streakKey, JSON.stringify({ lastDate: dateKey, count: 1 }));
        setStreak(1);
      }
    } catch {
      localStorage.removeItem(streakKey);
      localStorage.setItem(streakKey, JSON.stringify({ lastDate: dateKey, count: 1 }));
      setStreak(1);
    }
  }, [address, dateKey]);

  // 6) Toggle: storageKey hazır değilse tıklamayı blokla, hazırsa kaydet
  const toggle = (id: string) => {
    if (!storageKey) return;

    setCells((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, done: !c.done } : c));
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  };

  // 7) Bingo hesaplama (pos üzerinden)
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];

  const doneByPos = new Map<number, boolean>(cells.map((c) => [c.pos, c.done]));
  const bingoCount = lines.filter((line) => line.every((p) => doneByPos.get(p))).length;

  // 8) Reset: hem UI hem localStorage temizlensin
  const resetToday = () => {
    if (storageKey) localStorage.removeItem(storageKey);
    setCells(initialCells);
  };

  // 9) Share (UI'da gösterdiğimiz dateKey ile)
  const shareText = encodeURIComponent(
    `Base Bingo (${dateKey || todayKey()}) — ${bingoCount} bingo! 🎯\nBenimle oyna:`
  );

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 20, fontFamily: "system-ui" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28 }}>Base Bingo</h1>

          {address ? (
            <p style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
              Connected: {address.slice(0, 6)}…{address.slice(-4)} • 🔥 Streak: <b>{streak}</b> gün
            </p>
          ) : (
            <p style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
              (Guest mod) BaseApp içinde açınca streak adresine bağlanır.
            </p>
          )}

          <p style={{ margin: "6px 0 0", opacity: 0.8 }}>
            Günlük kart • {dateKey || "—"} • Bingo: <b>{bingoCount}</b>
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            onClick={resetToday}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.15)",
              background: "white",
              cursor: "pointer",
            }}
          >
            Sıfırla
          </button>

          <a
            href={`https://warpcast.com/~/compose?text=${shareText}`}
            target="_blank"
            rel="noreferrer"
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.15)",
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            Paylaş
          </a>
        </div>
      </div>

      <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {cells.length === 0 ? (
          <div style={{ opacity: 0.7, fontSize: 13 }}>Yükleniyor…</div>
        ) : (
          cells.map((c: Cell) => (
            <button
              key={c.id}
              onClick={() => toggle(c.id)}
              style={{
                minHeight: 90,
                padding: 12,
                borderRadius: 16,
                border: "1px solid rgba(0,0,0,0.15)",
                background: c.done ? "rgba(0,0,0,0.08)" : "white",
                cursor: storageKey ? "pointer" : "not-allowed",
                textAlign: "left",
                lineHeight: 1.25,
                opacity: storageKey ? 1 : 0.9,
              }}
              disabled={!storageKey}
            >
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
                {c.done ? "✅ Tamam" : "⬜ Boş"}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{c.text}</div>
            </button>
          ))
        )}
      </div>

      <div style={{ marginTop: 16, opacity: 0.8, fontSize: 13 }}>
        ✅ Kart kullanıcıya özel • ✅ Seçimler kaydediliyor • ✅ Streak hazır
      </div>
    </main>
  );
}
