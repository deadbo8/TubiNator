import { NextResponse } from "next/server";
import { checkBotSecret } from "@/lib/botAuth";
import {
  resolveTelegramUser,
  requireVerifiedTelegramUser,
  generateCourse,
  listEnrollments,
  ServiceError,
} from "@/lib/courseService";
import { GenerateRequestSchema } from "@/types/course";
import { z } from "zod";

const genSchema = z.object({
  telegramId: z.string().min(1),
  name: z.string().optional(),
  topic: z.string(),
  level: z.string(),
  goal: z.string(),
});

export async function POST(req: Request) {
  const unauth = checkBotSecret(req);
  if (unauth) return unauth;

  const body = await req.json().catch(() => null);
  const parsed = genSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const reqParsed = GenerateRequestSchema.safeParse({
    topic: parsed.data.topic,
    level: parsed.data.level,
    goal: parsed.data.goal,
  });
  if (!reqParsed.success)
    return NextResponse.json(
      { error: "Topic, level and goal are required" },
      { status: 400 },
    );

  try {
    const userId = await requireVerifiedTelegramUser(
      parsed.data.telegramId,
      parsed.data.name,
    );
    const result = await generateCourse(userId, reqParsed.data);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof ServiceError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const unauth = checkBotSecret(req);
  if (unauth) return unauth;

  const telegramId = new URL(req.url).searchParams.get("telegramId");
  if (!telegramId)
    return NextResponse.json({ error: "telegramId required" }, { status: 400 });

  const userId = await resolveTelegramUser(telegramId);
  const courses = await listEnrollments(userId);
  return NextResponse.json({ courses });
}
