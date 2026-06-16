import { NextResponse } from "next/server";
import { checkBotSecret } from "@/lib/botAuth";
import { resolveTelegramUser, ServiceError } from "@/lib/courseService";
import { enrollUser } from "@/lib/catalog";
import { z } from "zod";

const schema = z.object({ telegramId: z.string().min(1) });

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
    const result = await enrollUser(userId, params.id);
    if (!result.ok)
      return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof ServiceError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
