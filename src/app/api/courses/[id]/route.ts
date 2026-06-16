import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { deleteCourse, ServiceError } from "@/lib/courseService";
import { getAdminUser } from "@/lib/requireAdmin";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const course = await prisma.course.findUnique({
    where: { id: params.id },
    include: {
      modules: {
        orderBy: { order: "asc" },
        include: {
          lessons: {
            orderBy: { order: "asc" },
            include: {
              video: true,
              progress: { where: { userId } },
            },
          },
        },
      },
    },
  });
  if (!course)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    course,
    isAuthor: course.authorId === userId,
    isPublic: course.isPublic,
    slug: course.slug,
  });
}

// Delete a course (author or admin removes it entirely; an enrolled non-author
// just gets unenrolled).
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = await getAdminUser();
  try {
    const result = await deleteCourse(userId, params.id, Boolean(admin));
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const status = e instanceof ServiceError ? e.status : 500;
    const message = e instanceof Error ? e.message : "Could not delete course";
    return NextResponse.json({ error: message }, { status });
  }
}
