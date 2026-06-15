import { NextResponse } from "next/server";
import { checkBotSecret } from "@/lib/botAuth";
import {
  resolveTelegramUser,
  getCourse,
  ServiceError,
} from "@/lib/courseService";

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const unauth = checkBotSecret(req);
  if (unauth) return unauth;

  const telegramId = new URL(req.url).searchParams.get("telegramId");
  if (!telegramId)
    return NextResponse.json({ error: "telegramId required" }, { status: 400 });

  try {
    const userId = await resolveTelegramUser(telegramId);
    const course = await getCourse(userId, params.id);
    return NextResponse.json({ course });
  } catch (e) {
    if (e instanceof ServiceError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
