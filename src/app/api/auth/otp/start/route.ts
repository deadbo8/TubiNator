import { NextResponse } from "next/server";
import { z } from "zod";
import { createAndSendOtp, normalizeEmail } from "@/lib/otp";
import { isEmailConfigured } from "@/lib/email";

const schema = z.object({
  email: z.string().email(),
  purpose: z.enum(["verify", "login"]).default("login"),
});

// Sends a one-time code to an email for passwordless login (or re-verification).
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }
  if (!isEmailConfigured()) {
    return NextResponse.json(
      { error: "Email service is not configured. Set RESEND_API_KEY." },
      { status: 503 },
    );
  }
  const email = normalizeEmail(parsed.data.email);
  try {
    await createAndSendOtp(email, parsed.data.purpose);
  } catch (e) {
    return NextResponse.json(
      { error: "Could not send the code. Try again later." },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true });
}
