import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sendEmail, otpEmailHtml } from "@/lib/email";

export type OtpPurpose = "verify" | "login";

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function generateCode(): string {
  // 6-digit numeric code, zero-padded.
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Create a fresh OTP for an email + purpose, store its hash, and email it.
 * Any previous codes for the same email + purpose are invalidated.
 */
export async function createAndSendOtp(
  email: string,
  purpose: OtpPurpose,
): Promise<void> {
  const normalized = normalizeEmail(email);
  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 8);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await prisma.emailOtp.deleteMany({ where: { email: normalized, purpose } });
  await prisma.emailOtp.create({
    data: { email: normalized, codeHash, purpose, expiresAt },
  });

  await sendEmail({
    to: normalized,
    subject:
      purpose === "verify"
        ? "Verify your Tubinator email"
        : "Your Tubinator login code",
    html: otpEmailHtml(code, purpose),
  });
}

/**
 * Validate a submitted code. Consumes (deletes) the code on success.
 * Returns false on missing/expired/too-many-attempts/mismatch.
 */
export async function verifyOtp(
  email: string,
  code: string,
  purpose: OtpPurpose,
): Promise<boolean> {
  const normalized = normalizeEmail(email);
  const otp = await prisma.emailOtp.findFirst({
    where: { email: normalized, purpose },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) return false;

  if (otp.expiresAt.getTime() < Date.now()) {
    await prisma.emailOtp.delete({ where: { id: otp.id } }).catch(() => {});
    return false;
  }
  if (otp.attempts >= MAX_ATTEMPTS) {
    await prisma.emailOtp.delete({ where: { id: otp.id } }).catch(() => {});
    return false;
  }

  const ok = await bcrypt.compare(code.trim(), otp.codeHash);
  if (!ok) {
    await prisma.emailOtp.update({
      where: { id: otp.id },
      data: { attempts: otp.attempts + 1 },
    });
    return false;
  }

  await prisma.emailOtp.delete({ where: { id: otp.id } }).catch(() => {});
  return true;
}
