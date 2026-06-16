import { NextResponse } from "next/server";
import { checkBotSecret } from "@/lib/botAuth";
import { requireVerifiedTelegramUser, ServiceError } from "@/lib/courseService";
import { getDueReviews, getStats } from "@/lib/gamification";

export async function GET(req: Request) {
  const unauth = checkBotSecret(req);
  if (unauth) return unauth;

  const telegramId = new URL(req.url).searchParams.get("telegramId");
  if (!telegramId)
    return NextResponse.json({ error: "Missing telegramId" }, { status: 400 });

  try {
    const userId = await requireVerifiedTelegramUser(telegramId);
    const [reviews, stats] = await Promise.all([
      getDueReviews(userId),
      getStats(userId),
    ]);
    return NextResponse.json({ reviews, stats });
  } catch (e) {
    if (e instanceof ServiceError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
