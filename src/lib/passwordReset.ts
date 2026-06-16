// Password reset via emailed OTP. Works for any account that has an email,
// regardless of how it normally signs in (Google, Telegram, or password).
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { isEmailConfigured } from "@/lib/email";
import { createAndSendOtp, verifyOtp, normalizeEmail } from "@/lib/otp";

export class PasswordResetError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Step 1: email a reset code. Silently succeeds if the email is unknown. */
export async function requestPasswordReset(emailRaw: string): Promise<void> {
  if (!isEmailConfigured())
    throw new PasswordResetError("Email service is not configured", 503);
  const email = normalizeEmail(emailRaw);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return; // Don't reveal whether the account exists.
  try {
    await createAndSendOtp(email, "reset");
  } catch {
    throw new PasswordResetError("Could not send the reset email", 502);
  }
}

/** Step 2: verify the code and set a new password. */
export async function resetPasswordWithCode(
  emailRaw: string,
  code: string,
  newPassword: string,
): Promise<void> {
  if (!newPassword || newPassword.length < 8)
    throw new PasswordResetError("Password must be at least 8 characters", 400);
  const email = normalizeEmail(emailRaw);
  const ok = await verifyOtp(email, code, "reset");
  if (!ok) throw new PasswordResetError("Invalid or expired code", 400);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new PasswordResetError("Account not found", 400);
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { email },
    data: {
      passwordHash,
      emailVerified: user.emailVerified ?? new Date(),
    },
  });
}
