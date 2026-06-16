// Shared course operations used by both the web API routes and the Telegram
// bot API. Keeping the core logic here avoids duplicating business rules.

import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";
import { resolveKey, consumeHouseGeneration, Provider } from "@/lib/keys";
import { generateCourseOutline, pickBestVideoWithComments } from "@/lib/groq";
import {
  searchCandidates,
  relevanceScore,
  instructionalScore,
  fetchTopComments,
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

const LEVEL_ORDER = ["Beginner", "Intermediate", "Advanced"] as const;
type Level = (typeof LEVEL_ORDER)[number];

/** The level a learner should progress to after `level`, or null if maxed out. */
export function nextLevel(level: string): Level | null {
  const i = LEVEL_ORDER.indexOf(level as Level);
  if (i === -1 || i >= LEVEL_ORDER.length - 1) return null;
  return LEVEL_ORDER[i + 1];
}

/**
 * Generate (or reuse) the next-level course in a learning journey, building on
 * the modules/lessons of the course the learner just finished. Beginner ->
 * Intermediate -> Advanced. The new course shares the same topic + goal so it
 * slots into the global cache and reads as one continuous curriculum.
 */
export async function generateNextLevelCourse(
  userId: string,
  courseId: string,
) {
  const current = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      modules: {
        orderBy: { order: "asc" },
        include: { lessons: { orderBy: { order: "asc" } } },
      },
    },
  });
  if (!current) throw new ServiceError("Course not found", 404);

  const next = nextLevel(current.level);
  if (!next)
    throw new ServiceError(
      "You're already at the most advanced level for this course.",
      400,
    );

  // Reuse an existing next-level course if one was already generated.
  const cached = await prisma.course.findUnique({
    where: {
      topic_level_goal: {
        topic: current.topic,
        level: next,
        goal: current.goal,
      },
    },
  });
  if (cached) {
    await prisma.enrollment.upsert({
      where: { userId_courseId: { userId, courseId: cached.id } },
      update: {},
      create: { userId, courseId: cached.id },
    });
    return { courseId: cached.id, cached: true, level: next };
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

  // Summarise the completed course so the model can build on it (not repeat it).
  const priorOutline = current.modules
    .map(
      (m, mi) =>
        `${mi + 1}. ${m.title}\n` +
        m.lessons.map((l) => `   - ${l.title}`).join("\n"),
    )
    .join("\n");

  let outline;
  try {
    outline = await generateCourseOutline(
      groqKey.key,
      { topic: current.topic, level: next, goal: current.goal },
      { previousLevel: current.level, outline: priorOutline },
    );
  } catch (e) {
    throw new ServiceError(
      e instanceof Error ? e.message : "Generation failed",
      502,
    );
  }

  const course = await prisma.course.create({
    data: {
      title: outline.title,
      topic: current.topic,
      level: next,
      goal: current.goal,
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
  return {
    courseId: course.id,
    cached: false,
    level: next,
    remaining: gate.remaining,
  };
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

  const chosen = await selectBestVideo(userId, course.topic, lesson, pool, ytKey.key);
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
  const text = parts.join(" ").toLowerCase().replace(/practice task[\s\S]*$/, " ");
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
  ytApiKey: string,
): Promise<RankedVideo | null> {
  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0];

  const keywords = buildKeywords(
    topic,
    lesson.title,
    lesson.description,
    lesson.youtubeQuery,
  );
  const popular = (v: RankedVideo) =>
    Math.log10((v.viewCount || 0) + 1) * 2 +
    Math.log10((v.likeCount || 0) + 1) +
    Math.log10((v.commentCount || 0) + 1) * 0.5;
  const scored = pool.map((v) => ({
    v,
    rel: relevanceScore(v, keywords),
    instr: instructionalScore(v),
    pop: popular(v),
  }));
  // Prefer videos that are BOTH on-topic and look instructional (not
  // novelty/news/comedy), so a keyword-matching viral clip can't win on
  // popularity alone. Relax the filters only if nothing qualifies.
  let ranked = scored.filter((s) => s.rel > 0 && s.instr >= 0);
  if (ranked.length === 0) ranked = scored.filter((s) => s.rel > 0);
  if (ranked.length === 0) ranked = scored.filter((s) => s.instr >= 0);
  if (ranked.length === 0) ranked = scored;
  const rank = (s: { rel: number; instr: number; pop: number }) =>
    s.rel * 3 + s.instr * 3 + s.pop * 0.5;
  ranked.sort((a, b) => rank(b) - rank(a));

  // Take the strongest few, then let an LLM judge read each one's top ~80
  // viewer comments to choose the best-aligned, genuinely instructional video.
  // Comments are strong evidence of whether viewers actually learned from it.
  const shortlist = ranked.slice(0, 3).map((s) => s.v);
  const groqKey = await resolveKey(userId, "groq");
  if (groqKey && shortlist.length > 1) {
    try {
      const withComments = await Promise.all(
        shortlist.map(async (v) => ({
          title: v.title,
          channelName: v.channelName,
          description: v.description,
          duration: v.duration,
          comments: await fetchTopComments(ytApiKey, v.youtubeId, 80),
        })),
      );
      const idx = await pickBestVideoWithComments(
        groqKey.key,
        { title: lesson.title, description: lesson.description, topic },
        withComments,
      );
      if (idx >= 0 && idx < shortlist.length) {
        const pick = shortlist[idx];
        // Trust the judge unless its pick is clearly non-instructional and a
        // better instructional candidate exists in the shortlist.
        if (instructionalScore(pick) >= 0) return pick;
        const betterExists = shortlist.some(
          (c) => c !== pick && instructionalScore(c) >= 0,
        );
        if (!betterExists) return pick;
      }
    } catch {
      // fall through to algorithmic ranking
    }
  }

  return ranked[0]?.v ?? null;
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

  const chosen = await selectBestVideo(userId, course.topic, lesson, pool, ytKey.key);
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
