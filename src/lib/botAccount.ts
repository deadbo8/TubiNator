// Account, settings and admin logic shared by the Telegram bot API routes.
// Mirrors the website's account features (email verification, password,
// BYOK keys) and the admin dashboard, but keyed by Telegram ID.

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { decryptSecret, maskKey } from "@/lib/crypto";
import { resolveTelegramUser, ServiceError } from "@/lib/courseService";
import { isAdminEmail } from "@/lib/admin";
import { isEmailConfigured } from "@/lib/email";
import { createAndSendOtp, verifyOtp, normalizeEmail } from "@/lib/otp";

function houseLimit(): number {
  const n = parseInt(process.env.HOUSE_DAILY_LIMIT || "5", 10);
  return Number.isFinite(n) ? n : 5;
}

function safeMask(encrypted: string | null): string | null {
  if (!encrypted) return null;
  try {
    return maskKey(decryptSecret(encrypted));
  } catch {
    return "\u2022\u2022\u2022\u2022";
  }
}

/** Full account snapshot for the bot's /me and /settings screens. */
export async function getBotAccount(telegramId: string, name?: string) {
  const userId = await resolveTelegramUser(telegramId, name);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ServiceError("Account not found", 404);

  const limit = user.dailyGenLimit ?? houseLimit();
  return {
    email: user.email,
    emailVerified: Boolean(user.emailVerified),
    hasPassword: Boolean(user.passwordHash),
    name: user.name,
    banned: user.banned,
    dailyGenCount: user.dailyGenCount,
    dailyGenLimit: user.dailyGenLimit,
    limit,
    usingOwnGroq: Boolean(user.groqApiKey),
    usingOwnYoutube: Boolean(user.youtubeApiKey),
    groqKeyMasked: safeMask(user.groqApiKey),
    youtubeKeyMasked: safeMask(user.youtubeApiKey),
    isAdmin: Boolean(user.email) && isAdminEmail(user.email),
  };
}

/** Step 1 of linking an email to a Telegram account: email a verify code. */
export async function linkEmailStart(telegramId: string, emailRaw: string) {
  await resolveTelegramUser(telegramId);
  const email = normalizeEmail(emailRaw);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    throw new ServiceError("That doesn't look like a valid email", 400);
  if (!isEmailConfigured())
    throw new ServiceError("Email service is not configured on the server", 503);
  try {
    await createAndSendOtp(email, "verify");
  } catch {
    throw new ServiceError("Could not send the verification email", 502);
  }
  return { email };
}

/**
 * Step 2: confirm the code and attach the email to the Telegram account.
 * If a separate web account already uses that email, the Telegram account's
 * data is merged into it so the user shares one account across web + Telegram.
 */
export async function linkEmailConfirm(
  telegramId: string,
  emailRaw: string,
  code: string,
) {
  const email = normalizeEmail(emailRaw);
  const ok = await verifyOtp(email, code, "verify");
  if (!ok) throw new ServiceError("Invalid or expired code", 400);

  const tgUserId = await resolveTelegramUser(telegramId);
  const tgUser = await prisma.user.findUnique({ where: { id: tgUserId } });
  if (!tgUser) throw new ServiceError("Account not found", 404);

  const emailUser = await prisma.user.findUnique({ where: { email } });

  // Simple case: no existing account with that email -> just set it.
  if (!emailUser || emailUser.id === tgUser.id) {
    await prisma.user.update({
      where: { id: tgUser.id },
      data: { email, emailVerified: new Date() },
    });
    return { merged: false, email };
  }

  // Merge the Telegram-only account into the existing email account.
  // Move enrollments (skip dupes), authored courses, progress and notes.
  const enrollments = await prisma.enrollment.findMany({
    where: { userId: tgUser.id },
  });
  for (const e of enrollments) {
    await prisma.enrollment.upsert({
      where: { userId_courseId: { userId: emailUser.id, courseId: e.courseId } },
      update: {},
      create: { userId: emailUser.id, courseId: e.courseId },
    });
  }
  await prisma.course.updateMany({
    where: { authorId: tgUser.id },
    data: { authorId: emailUser.id },
  });
  const progress = await prisma.progress.findMany({
    where: { userId: tgUser.id },
  });
  for (const p of progress) {
    await prisma.progress.upsert({
      where: { userId_lessonId: { userId: emailUser.id, lessonId: p.lessonId } },
      update: { completed: p.completed },
      create: { userId: emailUser.id, lessonId: p.lessonId, completed: p.completed },
    });
  }
  const notes = await prisma.note.findMany({ where: { userId: tgUser.id } });
  for (const n of notes) {
    await prisma.note.upsert({
      where: { userId_lessonId: { userId: emailUser.id, lessonId: n.lessonId } },
      update: {},
      create: { userId: emailUser.id, lessonId: n.lessonId, content: n.content },
    });
  }

  // Carry over BYOK keys if the email account doesn't already have them.
  const keyData: Record<string, string> = {};
  if (!emailUser.groqApiKey && tgUser.groqApiKey)
    keyData.groqApiKey = tgUser.groqApiKey;
  if (!emailUser.youtubeApiKey && tgUser.youtubeApiKey)
    keyData.youtubeApiKey = tgUser.youtubeApiKey;

  // Free up the unique telegramId, delete the old row, then attach to the email account.
  await prisma.user.update({
    where: { id: tgUser.id },
    data: { telegramId: null },
  });
  await prisma.user.delete({ where: { id: tgUser.id } });
  await prisma.user.update({
    where: { id: emailUser.id },
    data: {
      telegramId,
      emailVerified: emailUser.emailVerified ?? new Date(),
      ...keyData,
    },
  });

  return { merged: true, email };
}

/** Set or change the password (requires a linked, verified email). */
export async function setBotPassword(
  telegramId: string,
  newPassword: string,
  currentPassword?: string,
) {
  if (!newPassword || newPassword.length < 8)
    throw new ServiceError("Password must be at least 8 characters", 400);

  const userId = await resolveTelegramUser(telegramId);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ServiceError("Account not found", 404);
  if (!user.email || !user.emailVerified)
    throw new ServiceError(
      "Link and verify your email first (use Link email).",
      400,
    );
  if (user.passwordHash) {
    if (!currentPassword)
      throw new ServiceError("Send your current password too", 400);
    const okPw = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!okPw) throw new ServiceError("Current password is incorrect", 400);
  }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  return { ok: true };
}

// ---- Admin (via Telegram) ----

async function requireBotAdmin(telegramId: string) {
  const userId = await resolveTelegramUser(telegramId);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.email || !isAdminEmail(user.email))
    throw new ServiceError("You are not an admin", 403);
  return user;
}

export async function botAdminListUsers(telegramId: string) {
  await requireBotAdmin(telegramId);
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      name: true,
      email: true,
      telegramId: true,
      emailVerified: true,
      banned: true,
      dailyGenCount: true,
      dailyGenLimit: true,
      _count: { select: { courses: true } },
    },
  });
  return users.map((u) => ({
    ...u,
    emailVerified: Boolean(u.emailVerified),
    isAdmin: Boolean(u.email) && isAdminEmail(u.email),
  }));
}

export async function botAdminUpdateUser(
  telegramId: string,
  targetId: string,
  data: { dailyGenLimit?: number | null; banned?: boolean },
) {
  const admin = await requireBotAdmin(telegramId);
  if (targetId === admin.id && data.banned === true)
    throw new ServiceError("You can't ban yourself", 400);
  const update: Record<string, unknown> = {};
  if (data.dailyGenLimit !== undefined) update.dailyGenLimit = data.dailyGenLimit;
  if (data.banned !== undefined) update.banned = data.banned;
  const user = await prisma.user.update({
    where: { id: targetId },
    data: update,
    select: { id: true, banned: true, dailyGenLimit: true, email: true },
  });
  return user;
}

export async function botAdminDeleteUser(telegramId: string, targetId: string) {
  const admin = await requireBotAdmin(telegramId);
  if (targetId === admin.id)
    throw new ServiceError("You can't delete your own account", 400);
  await prisma.user.delete({ where: { id: targetId } });
  return { ok: true };
}
