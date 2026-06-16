import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { repickLessonVideo, ServiceError } from "@/lib/courseService";
import { getAdminUser } from "@/lib/requireAdmin";

// Pick a different video for a lesson. Only the course author (or an admin) may
// do this, since the video is shared across everyone taking the course.
export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const lesson = await prisma.lesson.findUnique({
    where: { id: params.id },
    select: { module: { select: { course: { select: { authorId: true } } } } },
  });
  if (!lesson)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const admin = await getAdminUser();
  if (lesson.module.course.authorId !== userId && !admin)
    return NextResponse.json(
      { error: "Only the course author can change the video" },
      { status: 403 },
    );

  try {
    const video = await repickLessonVideo(userId, params.id);
    return NextResponse.json({ video });
  } catch (e) {
    const status = e instanceof ServiceError ? e.status : 500;
    const message =
      e instanceof Error ? e.message : "Could not find another video";
    return NextResponse.json({ error: message }, { status });
  }
}
