import { NextResponse } from "next/server";
import { z } from "zod";
import { requestPasswordReset, PasswordResetError } from "@/lib/passwordReset";

const schema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });

  try {
    await requestPasswordReset(parsed.data.email);
    // Always return ok so we never reveal whether an account exists.
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof PasswordResetError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
