import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicCourseBySlug } from "@/lib/catalog";
import { Card } from "@/components/ui/card";
import { EnrollButton } from "@/components/enroll-button";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const course = await getPublicCourseBySlug(params.slug);
  if (!course) return { title: "Course not found \u2014 Tubinator" };
  const lessons = course.modules.reduce((s, m) => s + m.lessons.length, 0);
  const description = `A ${course.level.toLowerCase()} course: ${course.goal}. ${lessons} hand-picked video lessons, free on Tubinator.`;
  return {
    title: `${course.title} \u2014 Tubinator`,
    description,
    openGraph: {
      title: course.title,
      description,
      type: "website",
      url: `/c/${course.slug}`,
    },
    twitter: {
      card: "summary_large_image",
      title: course.title,
      description,
    },
    alternates: { canonical: `/c/${course.slug}` },
  };
}

export default async function PublicCoursePage({
  params,
}: {
  params: { slug: string };
}) {
  const course = await getPublicCourseBySlug(params.slug);
  if (!course) notFound();

  const lessons = course.modules.reduce((s, m) => s + m.lessons.length, 0);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: course.title,
    description: course.goal,
    educationalLevel: course.level,
    provider: { "@type": "Organization", name: "Tubinator" },
  };
  const jsonLdProps = { __html: JSON.stringify(jsonLd) };

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdProps} />
      <Link href="/explore" className="text-sm text-white/50 hover:underline">
        ← Explore
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="text-xs uppercase tracking-wide text-white/40">
            {course.level}
          </span>
          <h1 className="mt-1 font-display text-3xl font-bold">{course.title}</h1>
          <p className="mt-1 text-white/50">{course.goal}</p>
          <p className="mt-2 text-xs text-white/40">
            {lessons} lessons · {course._count.enrollments}{" "}
            {course._count.enrollments === 1 ? "learner" : "learners"}
          </p>
        </div>
        <EnrollButton courseId={course.id} />
      </div>

      <div className="mt-8 space-y-6">
        {course.modules.map((m, i) => (
          <Card key={m.id}>
            <h2 className="text-lg font-semibold">
              {i + 1}. {m.title}
            </h2>
            <ul className="mt-3 space-y-2">
              {m.lessons.map((l) => (
                <li key={l.id} className="text-sm text-white/70">
                  • {l.title}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </main>
  );
}
