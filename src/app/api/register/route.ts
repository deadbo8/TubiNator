import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createAndSendOtp, normalizeEmail } from "@/lib/otp";
import { isEmailConfigured } from "@/lib/email";

const schema = z.object({
  name: z.string().min(1).max(80).optional(),
  email: z.string().email(),
  password: z.string().min(6).max(100),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { name, password } = parsed.data;
  const email = normalizeEmail(parsed.data.email);
  const passwordHash = await bcrypt.hash(password, 12);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Allow an unverified account to be re-claimed (update creds, re-send code).
    if (existing.emailVerified) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 409 },
      );
    }
    await prisma.user.update({
      where: { id: existing.id },
      data: { name: name ?? existing.name, passwordHash },
    });
  } else {
    await prisma.user.create({ data: { name, email, passwordHash } });
  }

  // Send the verification code. If email isn't configured, surface a clear error.
  if (!isEmailConfigured()) {
    return NextResponse.json(
      { error: "Email service is not configured. Set SMTP_USER and SMTP_PASS." },
      { status: 503 },
    );
  }
  try {
    await createAndSendOtp(email, "verify");
  } catch (e) {
    console.error("[register] verification email failed:", e);
    return NextResponse.json(
      { error: "Could not send verification email. Try again later." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, needsVerification: true });
}
