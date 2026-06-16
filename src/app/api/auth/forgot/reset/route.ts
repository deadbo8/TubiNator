import { NextResponse } from "next/server";
import { z } from "zod";
import { resetPasswordWithCode, PasswordResetError } from "@/lib/passwordReset";

const schema = z.object({
  email: z.string().email(),
  code: z.string().min(4).max(8),
  password: z.string().min(8).max(100),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid code or password" }, { status: 400 });

  try {
    await resetPasswordWithCode(
      parsed.data.email,
      parsed.data.code,
      parsed.data.password,
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof PasswordResetError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
