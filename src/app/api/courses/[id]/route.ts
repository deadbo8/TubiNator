import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

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
