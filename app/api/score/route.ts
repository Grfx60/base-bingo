import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

export async function POST(req: Request) {
  const body = await req.json();

  const {
    weekKey,
    playerId,
    name,
    score,
    level,
  } = body;

  if (!weekKey || !playerId) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  // basit anti cheat
  const maxScore = 1500 + level * 4500;
  if (score > maxScore) {
    return NextResponse.json({ error: "score rejected" }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin
    .from("brickbreaker_scores")
    .select("id,score")
    .eq("week_key", weekKey)
    .eq("player_id", playerId)
    .limit(1);

  const prev = existing?.[0];

  if (prev && prev.score >= score) {
    return NextResponse.json({ ok: true });
  }

  if (prev?.id) {
    await supabaseAdmin
      .from("brickbreaker_scores")
      .update({
        score,
        level,
        name,
      })
      .eq("id", prev.id);
  } else {
    await supabaseAdmin
      .from("brickbreaker_scores")
      .insert({
        week_key: weekKey,
        player_id: playerId,
        name,
        score,
        level,
      });
  }

  return NextResponse.json({ ok: true });
}