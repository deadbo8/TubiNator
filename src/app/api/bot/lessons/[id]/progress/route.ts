import { NextResponse } from "next/server";
import { checkBotSecret } from "@/lib/botAuth";
import {
  resolveTelegramUser,
  setProgress,
  ServiceError,
} from "@/lib/courseService";
import { z } from "zod";

const schema = z.object({
  telegramId: z.string().min(1),
  completed: z.boolean(),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const unauth = checkBotSecret(req);
  if (unauth) return unauth;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    const userId = await resolveTelegramUser(parsed.data.telegramId);
    const progress = await setProgress(
      userId,
      params.id,
      parsed.data.completed,
    );
    return NextResponse.json({ progress });
  } catch (e) {
    if (e instanceof ServiceError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
