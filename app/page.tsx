"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useMiniKit } from "@coinbase/onchainkit/minikit";

/* ================= ICONS ================= */

function BrickIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="opacity-90">
      <path
        d="M4 7h8v4H4V7Zm10 0h6v4h-6V7ZM4 13h6v4H4v-4Zm8 0h8v4h-8v-4Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function BingoIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="opacity-90">
      <path
        d="M6 7h12M6 12h12M6 17h12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M8 5v14M12 5v14M16 5v14"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.6"
      />
    </svg>
  );
}

/* ================= HOME ================= */

export default function Home() {
  const [dailyBest, setDailyBest] = useState<number>(0);
  const { setFrameReady, isFrameReady } = useMiniKit();

  useEffect(() => {
    // ✅ Base Mini App READY signal
    if (!isFrameReady) {
      setFrameReady();
    }

    // ✅ Daily score load
    const d = new Date();
    const dailyId = `${d.getFullYear()}-${String(
      d.getMonth() + 1
    ).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const key = `bb_daily_best_${dailyId}`;
    const raw = localStorage.getItem(key);
    const n = raw ? Number(raw) : 0;

    setDailyBest(Number.isFinite(n) ? n : 0);
  }, [isFrameReady, setFrameReady]);

  return (
    <div className="min-h-[100dvh] bg-black text-white px-4 py-6">
      <div className="max-w-[520px] mx-auto">
        {/* HEADER */}
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold tracking-tight">
            Base Bingo
          </h1>
          <p className="text-white/70 mt-1">
            Mini games inside Base App. Pick a game 👇
          </p>
        </div>

        {/* GAME LIST */}
        <div className="grid gap-3">

          {/* BRICK BREAKER */}
          <Link
            href="/brick-breaker"
            className="block rounded-3xl border border-white/15 bg-white/8 p-4
                       shadow-[0_0_0_1px_rgba(255,255,255,0.06)]
                       active:scale-[0.99] transition"
          >
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center">
                <BrickIcon />
              </div>

              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <div className="text-lg font-extrabold">
                    Brick Breaker
                  </div>

                  <div className="inline-flex items-center text-sm">
                    <span className="text-white/60 mr-1">Today</span>
                    <span className="font-bold">
                      {dailyBest > 0 ? dailyBest : "New"}
                    </span>
                  </div>
                </div>

                <div className="text-sm text-white/70 mt-1">
                  Tap to launch, drag to move. Beat levels, chase score.
                </div>
              </div>
            </div>
          </Link>

          {/* BINGO */}
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4 opacity-70">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center">
                <BingoIcon />
              </div>

              <div>
                <div className="text-lg font-extrabold">Bingo</div>
                <div className="text-sm text-white/70 mt-1">
                  Coming soon…
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
          Tip: Daily challenge + share score = growth 🚀
        </div>
      </div>
    </div>
  );
}