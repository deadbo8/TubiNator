import { NextResponse } from "next/server";
import { checkBotSecret } from "@/lib/botAuth";
import { resolveTelegramUser, ServiceError } from "@/lib/courseService";
import { gradeReview } from "@/lib/gamification";
import { z } from "zod";

const schema = z.object({
  telegramId: z.string().min(1),
  remembered: z.boolean(),
});

export async function POST(
  req: Request,
  { params }: { params: { lessonId: string } },
) {
  const unauth = checkBotSecret(req);
  if (unauth) return unauth;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    const userId = await resolveTelegramUser(parsed.data.telegramId);
    const result = await gradeReview(userId, params.lessonId, parsed.data.remembered);
    if (!result.ok)
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof ServiceError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
