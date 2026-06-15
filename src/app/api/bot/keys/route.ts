import { NextResponse } from "next/server";
import { checkBotSecret } from "@/lib/botAuth";
import {
  resolveTelegramUser,
  setUserKey,
  ServiceError,
} from "@/lib/courseService";
import { z } from "zod";

const schema = z.object({
  telegramId: z.string().min(1),
  provider: z.enum(["groq", "youtube"]),
  value: z.string().trim().min(1).nullable(),
});

export async function POST(req: Request) {
  const unauth = checkBotSecret(req);
  if (unauth) return unauth;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    const userId = await resolveTelegramUser(parsed.data.telegramId);
    await setUserKey(userId, parsed.data.provider, parsed.data.value);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ServiceError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
