// Public course catalog + sharing. Courses are shared cache entities, so
// "adding" a public course to your learning is just an enrollment.

import { prisma } from "@/lib/prisma";

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

async function uniqueSlug(base: string, courseId: string): Promise<string> {
  const root = base || "course";
  let slug = root;
  let n = 1;
  // Avoid collisions with other courses' slugs.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await prisma.course.findUnique({ where: { slug } });
    if (!existing || existing.id === courseId) return slug;
    n += 1;
    slug = `${root}-${n}`;
  }
}

/**
 * Publish or unpublish a course to the public catalog. Only the author may
 * change visibility. Generates a stable slug on first publish.
 */
export async function setCourseVisibility(
  userId: string,
  courseId: string,
  isPublic: boolean,
) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) return { ok: false as const, status: 404, error: "Not found" };
  if (course.authorId !== userId)
    return { ok: false as const, status: 403, error: "Only the author can share this course" };

  let slug = course.slug;
  if (isPublic && !slug) {
    slug = await uniqueSlug(slugify(course.title), course.id);
  }
  const updated = await prisma.course.update({
    where: { id: courseId },
    data: {
      isPublic,
      slug,
      publishedAt: isPublic ? course.publishedAt ?? new Date() : course.publishedAt,
    },
  });
  return {
    ok: true as const,
    isPublic: updated.isPublic,
    slug: updated.slug,
  };
}

/** Enroll the user into a course (used by "Add to my learning"). */
export async function enrollUser(userId: string, courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) return { ok: false as const, status: 404, error: "Not found" };
  await prisma.enrollment.upsert({
    where: { userId_courseId: { userId, courseId } },
    update: {},
    create: { userId, courseId },
  });
  return { ok: true as const, courseId };
}

export type CatalogCard = {
  id: string;
  slug: string | null;
  title: string;
  topic: string;
  level: string;
  goal: string;
  lessons: number;
  learners: number;
};

/** List public courses, optionally filtered by a free-text query. */
export async function listPublicCourses(query?: string): Promise<CatalogCard[]> {
  const q = query?.trim();
  const courses = await prisma.course.findMany({
    where: {
      isPublic: true,
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { topic: { contains: q, mode: "insensitive" } },
              { goal: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: 60,
    include: {
      _count: { select: { enrollments: true } },
      modules: { include: { _count: { select: { lessons: true } } } },
    },
  });
  return courses.map((c) => ({
    id: c.id,
    slug: c.slug,
    title: c.title,
    topic: c.topic,
    level: c.level,
    goal: c.goal,
    lessons: c.modules.reduce((sum, m) => sum + m._count.lessons, 0),
    learners: c._count.enrollments,
  }));
}

/** Full public course (for the SEO landing page at /c/[slug]). */
export async function getPublicCourseBySlug(slug: string) {
  const course = await prisma.course.findUnique({
    where: { slug },
    include: {
      _count: { select: { enrollments: true } },
      modules: {
        orderBy: { order: "asc" },
        include: { lessons: { orderBy: { order: "asc" } } },
      },
    },
  });
  if (!course || !course.isPublic) return null;
  return course;
}
