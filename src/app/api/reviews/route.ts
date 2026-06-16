import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDueReviews, getStats } from "@/lib/gamification";

// Due spaced-repetition reviews plus the user's gamification stats.
export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [reviews, stats] = await Promise.all([
    getDueReviews(userId),
    getStats(userId),
  ]);
  return NextResponse.json({ reviews, stats });
}
