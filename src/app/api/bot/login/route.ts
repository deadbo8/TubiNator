import { NextResponse } from "next/server";
import { z } from "zod";
import { checkBotSecret } from "@/lib/botAuth";
import { ServiceError } from "@/lib/courseService";
import { linkEmailWithPassword } from "@/lib/botAccount";

const schema = z.object({
  telegramId: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const unauth = checkBotSecret(req);
  if (unauth) return unauth;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });

  try {
    const res = await linkEmailWithPassword(
      parsed.data.telegramId,
      parsed.data.email,
      parsed.data.password,
    );
    return NextResponse.json(res);
  } catch (e) {
    if (e instanceof ServiceError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
