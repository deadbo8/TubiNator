// XP, streaks and spaced-repetition (SM-2 lite) logic.
// Pure data layer used by both web API routes and the Telegram bot API.

import { prisma } from "@/lib/prisma";

export const XP_PER_LESSON = 10;
export const XP_PER_REVIEW = 5;

/** Level curve: level N needs 100 * N * (N-1) / 2 cumulative XP (gentle ramp). */
export function levelForXp(xp: number) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const currentFloor = xpForLevel(level);
  const nextFloor = xpForLevel(level + 1);
  const into = xp - currentFloor;
  const span = nextFloor - currentFloor;
  return {
    level,
    into,
    span,
    pct: span > 0 ? Math.round((into / span) * 100) : 0,
    nextLevelXp: nextFloor,
  };
}

function xpForLevel(level: number): number {
  // Cumulative XP required to reach a level. Level 1 = 0, 2 = 100, 3 = 250, ...
  const n = Math.max(1, level) - 1;
  return Math.round(50 * n * (n + 1));
}

/** UTC midnight for a given date, used so streaks are day-based not time-based. */
function dayStart(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Record that the user did something "active" today and update their streak.
 * Same-day activity is a no-op; consecutive day increments; a gap resets to 1.
 * Returns the up-to-date streak count.
 */
export async function recordActivity(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { streakCount: true, longestStreak: true, lastActiveDate: true },
  });
  if (!user) return 0;

  const now = new Date();
  const today = dayStart(now);
  const last = user.lastActiveDate ? dayStart(user.lastActiveDate) : null;
  const ONE_DAY = 24 * 60 * 60 * 1000;

  let streak = user.streakCount || 0;
  if (last === today) {
    return streak; // already counted today
  } else if (last !== null && today - last === ONE_DAY) {
    streak += 1;
  } else {
    streak = 1;
  }
  const longest = Math.max(user.longestStreak || 0, streak);
  await prisma.user.update({
    where: { id: userId },
    data: { streakCount: streak, longestStreak: longest, lastActiveDate: now },
  });
  return streak;
}

async function awardXp(userId: string, amount: number): Promise<number> {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { xp: { increment: amount } },
    select: { xp: true },
  });
  return updated.xp;
}

export type Reward = {
  xpAwarded: number;
  totalXp: number;
  level: number;
  leveledUp: boolean;
  streak: number;
};

/**
 * Called when a lesson transitions to completed. Awards XP, schedules the
 * first spaced-repetition review, and bumps the streak.
 */
export async function awardLessonCompletion(
  userId: string,
  lessonId: string,
): Promise<Reward> {
  const before = await prisma.user.findUnique({
    where: { id: userId },
    select: { xp: true },
  });
  const prevLevel = levelForXp(before?.xp ?? 0).level;

  const totalXp = await awardXp(userId, XP_PER_LESSON);
  const streak = await recordActivity(userId);
  await scheduleFirstReview(userId, lessonId);

  const newLevel = levelForXp(totalXp).level;
  return {
    xpAwarded: XP_PER_LESSON,
    totalXp,
    level: newLevel,
    leveledUp: newLevel > prevLevel,
    streak,
  };
}

/** Create the first review (due tomorrow) if one doesn't already exist. */
async function scheduleFirstReview(userId: string, lessonId: string) {
  const due = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await prisma.review.upsert({
    where: { userId_lessonId: { userId, lessonId } },
    update: {},
    create: { userId, lessonId, dueAt: due, intervalDays: 1, ease: 2.5, reps: 0 },
  });
}

/** Reviews that are due now, with enough lesson context to quiz the user. */
export async function getDueReviews(userId: string, limit = 30) {
  const reviews = await prisma.review.findMany({
    where: { userId, dueAt: { lte: new Date() } },
    orderBy: { dueAt: "asc" },
    take: limit,
    include: {
      lesson: {
        include: {
          video: true,
          module: { include: { course: true } },
        },
      },
    },
  });
  return reviews.map((r) => ({
    lessonId: r.lessonId,
    reps: r.reps,
    dueAt: r.dueAt,
    title: r.lesson.title,
    description: r.lesson.description,
    courseTitle: r.lesson.module.course.title,
    courseId: r.lesson.module.course.id,
    video: r.lesson.video
      ? { youtubeId: r.lesson.video.youtubeId, title: r.lesson.video.title }
      : null,
  }));
}

export async function countDueReviews(userId: string): Promise<number> {
  return prisma.review.count({
    where: { userId, dueAt: { lte: new Date() } },
  });
}

/**
 * Grade a review. `remembered=true` lengthens the interval (SM-2 lite);
 * `false` resets it. Awards a little XP for honest reviewing and keeps the
 * streak alive. Returns the next due date and any reward.
 */
export async function gradeReview(
  userId: string,
  lessonId: string,
  remembered: boolean,
) {
  const review = await prisma.review.findUnique({
    where: { userId_lessonId: { userId, lessonId } },
  });
  if (!review) return { ok: false as const };

  let { intervalDays, ease, reps } = review;
  if (remembered) {
    reps += 1;
    if (reps === 1) intervalDays = 1;
    else if (reps === 2) intervalDays = 3;
    else intervalDays = Math.ceil(intervalDays * ease);
    ease = Math.min(3.0, ease + 0.05);
  } else {
    reps = 0;
    intervalDays = 1;
    ease = Math.max(1.3, ease - 0.2);
  }
  const dueAt = new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000);
  await prisma.review.update({
    where: { userId_lessonId: { userId, lessonId } },
    data: { intervalDays, ease, reps, dueAt },
  });

  let reward: Reward | null = null;
  if (remembered) {
    const totalXp = await awardXp(userId, XP_PER_REVIEW);
    const streak = await recordActivity(userId);
    reward = {
      xpAwarded: XP_PER_REVIEW,
      totalXp,
      level: levelForXp(totalXp).level,
      leveledUp: false,
      streak,
    };
  }
  return { ok: true as const, dueAt, intervalDays, reward };
}

/** Headline stats for the dashboard, settings, /me, and nav badges. */
export async function getStats(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { xp: true, streakCount: true, longestStreak: true },
  });
  const xp = user?.xp ?? 0;
  const lvl = levelForXp(xp);
  const dueReviews = await countDueReviews(userId);
  return {
    xp,
    level: lvl.level,
    levelPct: lvl.pct,
    xpIntoLevel: lvl.into,
    xpForNextLevel: lvl.span,
    streak: user?.streakCount ?? 0,
    longestStreak: user?.longestStreak ?? 0,
    dueReviews,
  };
}
