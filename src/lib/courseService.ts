// Shared course operations used by both the web API routes and the Telegram
// bot API. Keeping the core logic here avoids duplicating business rules.

import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";
import { resolveKey, consumeHouseGeneration, Provider } from "@/lib/keys";
import { generateCourseOutline } from "@/lib/groq";
import { searchAndRank } from "@/lib/youtube";
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
    update: name ? { name } : {},
    create: { telegramId, name },
  });
  return user.id;
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
    include: { video: true },
  });
  if (!lesson) throw new ServiceError("Lesson not found", 404);
  if (lesson.video) return lesson.video;

  const ytKey = await resolveKey(userId, "youtube");
  if (!ytKey) throw new ServiceError("No YouTube API key configured", 400);

  let ranked;
  try {
    ranked = await searchAndRank(ytKey.key, lesson.youtubeQuery);
  } catch (e) {
    throw new ServiceError(
      e instanceof Error ? e.message : "YouTube lookup failed",
      502,
    );
  }
  if (!ranked) throw new ServiceError("No suitable video found", 404);

  const video = await prisma.video.upsert({
    where: { youtubeId: ranked.youtubeId },
    update: {
      title: ranked.title,
      channelName: ranked.channelName,
      duration: ranked.duration,
      viewCount: ranked.viewCount,
      likeCount: ranked.likeCount,
    },
    create: {
      youtubeId: ranked.youtubeId,
      title: ranked.title,
      channelName: ranked.channelName,
      duration: ranked.duration,
      viewCount: ranked.viewCount,
      likeCount: ranked.likeCount,
    },
  });
  await prisma.lesson.update({
    where: { id: lesson.id },
    data: { videoId: video.id },
  });
  return video;
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
