
import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { verifyMessage } from "ethers";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

const MAX_SCORE = 999999;

export async function GET(req: Request) {
  console.log("LEADERBOARD ENV", {
  url: process.env.SUPABASE_URL,
  hasKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
});
  const { searchParams } = new URL(req.url);
  const dailyId = searchParams.get("dailyId");
  const limit = Math.min(Number(searchParams.get("limit") || 10), 50);

  if (!dailyId) return bad("dailyId required");

  const { data, error } = await supabaseAdmin
    .from("bb_scores")
    .select("address, score, level, mode, created_at")
    .eq("daily_id", dailyId)
    .eq("mode", "daily")
    .order("score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return bad(error.message, 500);
  return NextResponse.json({ ok: true, items: data ?? [] });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return bad("Invalid JSON");

  const dailyId = String(body.dailyId || "");
  const address = String(body.address || "").toLowerCase();
  const score = Number(body.score);
  const level = Number(body.level);
  const mode = String(body.mode || "daily");

  const message = String(body.message || "");
  const signature = String(body.signature || "");
  const nonce = String(body.nonce || "");

  if (!dailyId) return bad("dailyId required");
  if (!address || !address.startsWith("0x") || address.length < 10) return bad("address required");
  if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) return bad("invalid score");
  if (!Number.isFinite(level) || level < 1 || level > 999) return bad("invalid level");
  if (mode !== "daily") return bad("only daily allowed");

  if (!message || !signature || !nonce) return bad("message/signature/nonce required");

  // replay check
  const nonceExists = await supabaseAdmin.from("bb_nonces").select("nonce").eq("nonce", nonce).maybeSingle();
  if (nonceExists.data) return bad("nonce already used", 409);

  // verify signature
  let recovered = "";
  try {
    recovered = verifyMessage(message, signature).toLowerCase();
  } catch {
    return bad("invalid signature", 401);
  }
  if (recovered !== address) return bad("signature address mismatch", 401);

  // message shape check
  const expectedPrefix = `BrickBreaker Daily ${dailyId}`;
  if (!message.startsWith(expectedPrefix)) return bad("bad message prefix", 401);
  if (!message.includes(`Score ${score}`) || !message.includes(`Level ${level}`) || !message.includes(`Nonce ${nonce}`)) {
    return bad("bad message body", 401);
  }

  // persist nonce
  await supabaseAdmin.from("bb_nonces").insert({ nonce, address });

  // insert score
  const { error } = await supabaseAdmin.from("bb_scores").insert({
    daily_id: dailyId,
    address,
    score,
    level,
    mode,
  });

  if (error) {
  console.error("SUPABASE GET ERROR:", error);
  return bad(error.message, 500);
}
  return NextResponse.json({ ok: true });
}
