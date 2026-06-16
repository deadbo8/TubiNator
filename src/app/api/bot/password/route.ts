import { NextResponse } from "next/server";
import { z } from "zod";
import { checkBotSecret } from "@/lib/botAuth";
import { ServiceError } from "@/lib/courseService";
import { setBotPassword } from "@/lib/botAccount";

const schema = z.object({
  telegramId: z.string().min(1),
  newPassword: z.string().min(8).max(100),
  currentPassword: z.string().optional(),
});

export async function POST(req: Request) {
  const unauth = checkBotSecret(req);
  if (unauth) return unauth;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });

  try {
    const res = await setBotPassword(
      parsed.data.telegramId,
      parsed.data.newPassword,
      parsed.data.currentPassword,
    );
    return NextResponse.json(res);
  } catch (e) {
    if (e instanceof ServiceError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
