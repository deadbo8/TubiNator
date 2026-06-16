// Shared course operations used by both the web API routes and the Telegram
// bot API. Keeping the core logic here avoids duplicating business rules.

import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";
import { resolveKey, consumeHouseGeneration, Provider } from "@/lib/keys";
import { generateCourseOutline, pickBestVideoIndex } from "@/lib/groq";
import {
  searchCandidates,
  relevanceScore,
  type RankedVideo,
} from "@/lib/youtube";
import { GenerateRequest } from "@/types/course";
import { awardLessonCompletion, Reward } from "@/lib/gamification";

export class ServiceError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Find or create the app user that backs a given Telegram account. */
export async function resolveTelegramUser(
  telegramId: string,
  name?: string,
): Promise<string> {
  const user = await prisma.user.upsert({
    where: { telegramId },
    update: {},
    create: { telegramId, name },
  });
  return user.id;
}

/**
 * Like resolveTelegramUser, but requires the account to be "logged in" from
 * Telegram (verified email) and not banned. Use this to gate every action that
 * consumes resources or creates data. New accounts still inherit the default
 * daily limit (dailyGenLimit is null => HOUSE_DAILY_LIMIT).
 */
export async function requireVerifiedTelegramUser(
  telegramId: string,
  name?: string,
): Promise<string> {
  const userId = await resolveTelegramUser(telegramId, name);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ServiceError("Account not found", 404);
  if (user.banned) throw new ServiceError("This account is banned.", 403);
  if (!user.emailVerified)
    throw new ServiceError(
      "\uD83D\uDD12 Please verify your email first. Open the bot and tap /login to get started.",
      403,
    );
  return userId;
}

export async function generateCourse(userId: string, req: GenerateRequest) {
  const { topic, level, goal } = req;

  const cached = await prisma.course.findUnique({
    where: { topic_level_goal: { topic, level, goal } },
  });
  if (cached) {
    await prisma.enrollment.upsert({
      where: { userId_courseId: { userId, courseId: cached.id } },
      update: {},
      create: { userId, courseId: cached.id },
    });
    return { courseId: cached.id, cached: true };
  }

  const groqKey = await resolveKey(userId, "groq");
  if (!groqKey) throw new ServiceError("No Groq API key configured", 400);

  const gate = await consumeHouseGeneration(userId, groqKey.source === "user");
  if (!gate.allowed) {
    throw new ServiceError(
      "Daily free generation limit reached. Add your own Groq API key with /settings for unlimited generations.",
      429,
    );
  }

  let outline;
  try {
    outline = await generateCourseOutline(groqKey.key, { topic, level, goal });
  } catch (e) {
    throw new ServiceError(
      e instanceof Error ? e.message : "Generation failed",
      502,
    );
  }

  const course = await prisma.course.create({
    data: {
      title: outline.title,
      topic,
      level,
      goal,
      authorId: userId,
      modules: {
        create: outline.modules.map((m, mi) => ({
          title: m.title,
          order: mi,
          lessons: {
            create: m.lessons.map((l, li) => ({
              title: l.title,
              description: l.description,
              youtubeQuery: l.searchQuery,
              order: li,
            })),
          },
        })),
      },
    },
  });

  await prisma.enrollment.create({ data: { userId, courseId: course.id } });
  return { courseId: course.id, cached: false, remaining: gate.remaining };
}

export async function listEnrollments(userId: string) {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      course: {
        include: {
          modules: {
            include: { lessons: { include: { progress: { where: { userId } } } } },
          },
        },
      },
    },
  });
  return enrollments.map(({ course }) => {
    const lessons = course.modules.flatMap((m) => m.lessons);
    const done = lessons.filter((l) => l.progress[0]?.completed).length;
    return {
      id: course.id,
      title: course.title,
      topic: course.topic,
      level: course.level,
      total: lessons.length,
      done,
    };
  });
}

export async function getCourse(userId: string, courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      modules: {
        orderBy: { order: "asc" },
        include: {
          lessons: {
            orderBy: { order: "asc" },
            include: { video: true, progress: { where: { userId } } },
          },
        },
      },
    },
  });
  if (!course) throw new ServiceError("Course not found", 404);
  return course;
}

export async function fetchLessonVideo(userId: string, lessonId: string) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: {
      video: true,
      module: { include: { course: true } },
    },
  });
  if (!lesson) throw new ServiceError("Lesson not found", 404);
  if (lesson.video) return lesson.video;

  const ytKey = await resolveKey(userId, "youtube");
  if (!ytKey) throw new ServiceError("No YouTube API key configured", 400);

  const course = lesson.module.course;

  // Videos already used by other lessons in this course, so we never repeat one.
  const usedIds = await courseVideoYoutubeIds(course.id);

  // Fold the course topic into the query so generic searches still stay on-topic.
  const query = enrichQuery(course.topic, lesson.youtubeQuery);

  let candidates: RankedVideo[];
  try {
    candidates = await searchCandidates(ytKey.key, query);
  } catch (e) {
    throw new ServiceError(
      e instanceof Error ? e.message : "YouTube lookup failed",
      502,
    );
  }

  // Drop anything already used elsewhere in the course (dedup).
  let pool = candidates.filter((c) => !usedIds.has(c.youtubeId));
  if (pool.length === 0) pool = candidates; // nothing fresh left; allow reuse

  const chosen = await selectBestVideo(userId, course.topic, lesson, pool);
  if (!chosen) throw new ServiceError("No suitable video found", 404);

  const video = await prisma.video.upsert({
    where: { youtubeId: chosen.youtubeId },
    update: {
      title: chosen.title,
      channelName: chosen.channelName,
      duration: chosen.duration,
      viewCount: chosen.viewCount,
      likeCount: chosen.likeCount,
    },
    create: {
      youtubeId: chosen.youtubeId,
      title: chosen.title,
      channelName: chosen.channelName,
      duration: chosen.duration,
      viewCount: chosen.viewCount,
      likeCount: chosen.likeCount,
    },
  });
  await prisma.lesson.update({
    where: { id: lesson.id },
    data: { videoId: video.id },
  });
  return video;
}

/** youtubeIds already attached to any lesson in the given course. */
async function courseVideoYoutubeIds(courseId: string): Promise<Set<string>> {
  const lessons = await prisma.lesson.findMany({
    where: { module: { courseId }, videoId: { not: null } },
    select: { video: { select: { youtubeId: true } } },
  });
  return new Set(
    lessons
      .map((l) => l.video?.youtubeId)
      .filter((id): id is string => Boolean(id)),
  );
}

/** Ensure the course topic is present in the query for better, on-topic hits. */
function enrichQuery(topic: string, query: string): string {
  const q = query.trim();
  const lower = q.toLowerCase();
  const topicWords = topic.toLowerCase().split(/\s+/).filter(Boolean);
  const hasTopic =
    topicWords.length > 0 && topicWords.every((w) => lower.includes(w));
  return hasTopic ? q : `${q} ${topic}`.trim();
}

const STOPWORDS = new Set(
  "a an the to of for and or in on at with how what why your you this that using use intro introduction lesson video tutorial guide basics fundamentals overview practice task example examples step steps part learn learning".split(
    /\s+/,
  ),
);

function buildKeywords(...parts: string[]): string[] {
  const text = parts.join(" ").toLowerCase().replace(/practice task.*$/s, " ");
  const words = text
    .split(/[^a-z0-9+#.]+/)
    .map((w) => w.replace(/^\.+|\.+$/g, ""))
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  return Array.from(new Set(words));
}

/**
 * Choose the best video for a lesson. Prefers an LLM judge that reads each
 * candidate's title + description (a reliable proxy for "what the video is
 * about"); falls back to keyword-relevance blended with popularity, dropping
 * clearly off-topic candidates when better ones exist.
 */
async function selectBestVideo(
  userId: string,
  topic: string,
  lesson: { title: string; description: string; youtubeQuery: string },
  pool: RankedVideo[],
): Promise<RankedVideo | null> {
  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0];

  const groqKey = await resolveKey(userId, "groq");
  if (groqKey) {
    try {
      const idx = await pickBestVideoIndex(
        groqKey.key,
        { title: lesson.title, description: lesson.description, topic },
        pool.map((c) => ({
          title: c.title,
          channelName: c.channelName,
          description: c.description,
          duration: c.duration,
        })),
      );
      if (idx >= 0 && idx < pool.length) return pool[idx];
    } catch {
      // fall through to algorithmic ranking
    }
  }

  const keywords = buildKeywords(
    topic,
    lesson.title,
    lesson.description,
    lesson.youtubeQuery,
  );
  const popular = (v: RankedVideo) =>
    Math.log10((v.viewCount || 0) + 1) * 2 + Math.log10((v.likeCount || 0) + 1);
  const scored = pool.map((v) => ({
    v,
    rel: relevanceScore(v, keywords),
    pop: popular(v),
  }));
  // Relevance filter: if any candidate matches the lesson, drop the off-topic ones.
  const relevant = scored.filter((s) => s.rel > 0);
  const finalPool = relevant.length > 0 ? relevant : scored;
  finalPool.sort((a, b) => b.rel * 3 + b.pop - (a.rel * 3 + a.pop));
  return finalPool[0]?.v ?? null;
}

export async function setProgress(
  userId: string,
  lessonId: string,
  completed: boolean,
): Promise<{ progress: Awaited<ReturnType<typeof prisma.progress.upsert>>; reward: Reward | null }> {
  const existing = await prisma.progress.findUnique({
    where: { userId_lessonId: { userId, lessonId } },
    select: { completed: true },
  });
  const progress = await prisma.progress.upsert({
    where: { userId_lessonId: { userId, lessonId } },
    update: { completed },
    create: { userId, lessonId, completed },
  });

  // Only award XP / streak / schedule a review on a fresh completion.
  let reward: Reward | null = null;
  if (completed && !existing?.completed) {
    reward = await awardLessonCompletion(userId, lessonId);
  }
  return { progress, reward };
}

export async function setUserKey(
  userId: string,
  provider: Provider,
  value: string | null,
) {
  const field = provider === "groq" ? "groqApiKey" : "youtubeApiKey";
  await prisma.user.update({
    where: { id: userId },
    data: { [field]: value ? encryptSecret(value) : null },
  });
}

/**
 * Delete a course. The author (or an admin) removes the whole course for
 * everyone (cascades modules/lessons/progress/notes/reviews/enrollments).
 * A non-author who is merely enrolled only has their enrollment removed.
 */
export async function deleteCourse(
  userId: string,
  courseId: string,
  isAdmin = false,
): Promise<{ deleted: boolean; unenrolled: boolean }> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, authorId: true },
  });
  if (!course) throw new ServiceError("Course not found", 404);

  if (isAdmin || course.authorId === userId) {
    await prisma.course.delete({ where: { id: courseId } });
    return { deleted: true, unenrolled: false };
  }

  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });
  if (!enrollment) throw new ServiceError("You can't delete this course", 403);
  await prisma.enrollment.delete({
    where: { userId_courseId: { userId, courseId } },
  });
  return { deleted: false, unenrolled: true };
}

/**
 * Replace a lesson's video with a different one, excluding the current video
 * and any video already used elsewhere in the course. Caller must enforce that
 * only the author/admin can do this (the video is shared across the course).
 */
export async function repickLessonVideo(userId: string, lessonId: string) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: {
      video: true,
      module: { include: { course: true } },
    },
  });
  if (!lesson) throw new ServiceError("Lesson not found", 404);

  const course = lesson.module.course;

  const ytKey = await resolveKey(userId, "youtube");
  if (!ytKey) throw new ServiceError("No YouTube API key configured", 400);

  const usedIds = await courseVideoYoutubeIds(course.id);
  const currentId = lesson.video?.youtubeId;
  if (currentId) usedIds.add(currentId);

  const query = enrichQuery(course.topic, lesson.youtubeQuery);
  let candidates: RankedVideo[];
  try {
    candidates = await searchCandidates(ytKey.key, query);
  } catch (e) {
    throw new ServiceError(
      e instanceof Error ? e.message : "YouTube lookup failed",
      502,
    );
  }

  let pool = candidates.filter((c) => !usedIds.has(c.youtubeId));
  if (pool.length === 0)
    pool = candidates.filter((c) => c.youtubeId !== currentId);
  if (pool.length === 0) throw new ServiceError("No other video found", 404);

  const chosen = await selectBestVideo(userId, course.topic, lesson, pool);
  if (!chosen) throw new ServiceError("No other video found", 404);

  const video = await prisma.video.upsert({
    where: { youtubeId: chosen.youtubeId },
    update: {
      title: chosen.title,
      channelName: chosen.channelName,
      duration: chosen.duration,
      viewCount: chosen.viewCount,
      likeCount: chosen.likeCount,
    },
    create: {
      youtubeId: chosen.youtubeId,
      title: chosen.title,
      channelName: chosen.channelName,
      duration: chosen.duration,
      viewCount: chosen.viewCount,
      likeCount: chosen.likeCount,
    },
  });
  await prisma.lesson.update({
    where: { id: lesson.id },
    data: { videoId: video.id },
  });
  return video;
}

/** Admin: list courses a user authored or is enrolled in, with their progress. */
export async function listUserCourses(targetUserId: string) {
  const courses = await prisma.course.findMany({
    where: {
      OR: [
        { authorId: targetUserId },
        { enrollments: { some: { userId: targetUserId } } },
      ],
    },
    orderBy: { createdAt: "desc" },
    include: {
      modules: {
        include: {
          lessons: {
            include: { progress: { where: { userId: targetUserId } } },
          },
        },
      },
      _count: { select: { enrollments: true } },
    },
  });
  return courses.map((c) => {
    const lessons = c.modules.flatMap((m) => m.lessons);
    const done = lessons.filter((l) => l.progress[0]?.completed).length;
    return {
      id: c.id,
      title: c.title,
      topic: c.topic,
      level: c.level,
      isPublic: c.isPublic,
      isAuthor: c.authorId === targetUserId,
      total: lessons.length,
      done,
      enrolledCount: c._count.enrollments,
      createdAt: c.createdAt,
    };
  });
}
