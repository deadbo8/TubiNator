import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyOtp, normalizeEmail } from "@/lib/otp";

const schema = z.object({
  email: z.string().email(),
  code: z.string().min(4).max(8),
});

// Confirms a "verify" OTP and marks the account's email as verified.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const email = normalizeEmail(parsed.data.email);
  const ok = await verifyOtp(email, parsed.data.code, "verify");
  if (!ok) {
    return NextResponse.json(
      { error: "Invalid or expired code" },
      { status: 400 },
    );
  }
  await prisma.user.updateMany({
    where: { email, emailVerified: null },
    data: { emailVerified: new Date() },
  });
  return NextResponse.json({ ok: true });
}
