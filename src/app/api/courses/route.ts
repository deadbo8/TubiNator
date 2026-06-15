import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { GenerateRequestSchema } from "@/types/course";
import { generateCourseOutline } from "@/lib/groq";
import { resolveKey, consumeHouseGeneration } from "@/lib/keys";

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = GenerateRequestSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { topic, level, goal } = parsed.data;

  // Cache hit: reuse a canonical course for the same topic+level+goal.
  const cached = await prisma.course.findUnique({
    where: { topic_level_goal: { topic, level, goal } },
  });
  if (cached) {
    await prisma.enrollment.upsert({
      where: { userId_courseId: { userId, courseId: cached.id } },
      update: {},
      create: { userId, courseId: cached.id },
    });
    return NextResponse.json({ courseId: cached.id, cached: true });
  }

  // Resolve Groq key (user BYOK or house) and enforce the house rate limit.
  const groqKey = await resolveKey(userId, "groq");
  if (!groqKey)
    return NextResponse.json(
      { error: "No Groq API key configured" },
      { status: 400 },
    );

  const gate = await consumeHouseGeneration(userId, groqKey.source === "user");
  if (!gate.allowed) {
    return NextResponse.json(
      {
        error:
          "Daily free generation limit reached. Add your own Groq API key in Settings for unlimited generations.",
      },
      { status: 429 },
    );
  }

  let outline;
  try {
    outline = await generateCourseOutline(groqKey.key, { topic, level, goal });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // Persist the canonical course + modules + lessons. Videos are fetched lazily
  // when a lesson is first opened (saves YouTube quota).
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

  return NextResponse.json({
    courseId: course.id,
    cached: false,
    remaining: gate.remaining,
  });
}
