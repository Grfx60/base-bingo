import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { verifyMessage } from "ethers";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

const MAX_SCORE = 999999;

function asString(v: unknown) {
  return typeof v === "string" ? v : "";
}

function safeDailyId(dailyId: string) {
  // Accept: YYYY-MM-DD only
  return /^\d{4}-\d{2}-\d{2}$/.test(dailyId);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const dailyId = asString(searchParams.get("dailyId"));
    const limitRaw = Number(searchParams.get("limit") || 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 10;

    if (!dailyId) return bad("dailyId required");
    if (!safeDailyId(dailyId)) return bad("invalid dailyId format");

    const { data, error } = await supabaseAdmin
      .from("bb_scores")
      .select("address, score, level, mode, created_at")
      .eq("daily_id", dailyId)
      .eq("mode", "daily")
      .order("score", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("SUPABASE GET ERROR:", error);
      return bad(error.message, 500);
    }

    // Return a stable response shape for the client
    return NextResponse.json({ ok: true, items: data ?? [] });
  } catch (e) {
    console.error("LEADERBOARD GET FATAL:", e);
    return bad("server error", 500);
  }
}

export async function POST(req: Request) {
  try {
    const bodyUnknown: unknown = await req.json().catch(() => null);
    if (!bodyUnknown || typeof bodyUnknown !== "object") return bad("Invalid JSON");

    const body = bodyUnknown as Record<string, unknown>;

    const dailyId = String(body.dailyId || "");
    const address = String(body.address || "").toLowerCase();
    const score = Number(body.score);
    const level = Number(body.level);
    const mode = String(body.mode || "daily");

    const message = String(body.message || "");
    const signature = String(body.signature || "");
    const nonce = String(body.nonce || "");

    if (!dailyId) return bad("dailyId required");
    if (!safeDailyId(dailyId)) return bad("invalid dailyId format");

    if (!address || !address.startsWith("0x") || address.length < 10) return bad("address required");
    if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) return bad("invalid score");
    if (!Number.isFinite(level) || level < 1 || level > 999) return bad("invalid level");
    if (mode !== "daily") return bad("only daily allowed");

    if (!message || !signature || !nonce) return bad("message/signature/nonce required");

    // Message shape check (cheap, before signature verify)
    const expectedPrefix = `BrickBreaker Daily ${dailyId}`;
    if (!message.startsWith(expectedPrefix)) return bad("bad message prefix", 401);
    if (!message.includes(`Score ${score}`) || !message.includes(`Level ${level}`) || !message.includes(`Nonce ${nonce}`)) {
      return bad("bad message body", 401);
    }

    // Replay check (nonce) - do it AFTER cheap checks, BEFORE insert
    const nonceExists = await supabaseAdmin.from("bb_nonces").select("nonce").eq("nonce", nonce).maybeSingle();
    if (nonceExists.error) {
      console.error("SUPABASE NONCE CHECK ERROR:", nonceExists.error);
      return bad(nonceExists.error.message, 500);
    }
    if (nonceExists.data) return bad("nonce already used", 409);

    // Verify signature
    let recovered = "";
    try {
      recovered = verifyMessage(message, signature).toLowerCase();
    } catch {
      return bad("invalid signature", 401);
    }
    if (recovered !== address) return bad("signature address mismatch", 401);

    // Insert nonce first (unique constraint recommended on bb_nonces.nonce)
    const insNonce = await supabaseAdmin.from("bb_nonces").insert({ nonce, address });
    if (insNonce.error) {
      // If you add a UNIQUE constraint on nonce, a race becomes a clean 409
      const msg = insNonce.error.message.toLowerCase();
      if (msg.includes("duplicate") || msg.includes("unique")) return bad("nonce already used", 409);
      console.error("SUPABASE NONCE INSERT ERROR:", insNonce.error);
      return bad(insNonce.error.message, 500);
    }

    // Best score of the day logic
const existing = await supabaseAdmin
  .from("bb_scores")
  .select("score, level")
  .eq("daily_id", dailyId)
  .eq("address", address)
  .eq("mode", mode)
  .maybeSingle();

if (existing.error) {
  console.error("SUPABASE EXISTING SCORE ERROR:", existing.error);
  return bad(existing.error.message, 500);
}

const prevScore = existing.data ? Number(existing.data.score) : -1;
const prevLevel = existing.data ? Number(existing.data.level) : -1;

const isBetter =
  score > prevScore ||
  (score === prevScore && level > prevLevel);

if (!existing.data) {
  // first submit today
  const ins = await supabaseAdmin.from("bb_scores").insert({
    daily_id: dailyId,
    address,
    score,
    level,
    mode,
  });

  if (ins.error) {
    console.error("SUPABASE SCORE INSERT ERROR:", ins.error);
    return bad(ins.error.message, 500);
  }
} else if (isBetter) {
  // update only if better
  const upd = await supabaseAdmin
    .from("bb_scores")
    .update({ score, level })
    .eq("daily_id", dailyId)
    .eq("address", address)
    .eq("mode", mode);

  if (upd.error) {
    console.error("SUPABASE SCORE UPDATE ERROR:", upd.error);
    return bad(upd.error.message, 500);
  }
} else {
  // worse score → ignore
}


    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("LEADERBOARD POST FATAL:", e);
    return bad("server error", 500);
  }
}
