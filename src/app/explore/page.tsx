import Link from "next/link";
import type { Metadata } from "next";
import { listPublicCourses } from "@/lib/catalog";
import { Card } from "@/components/ui/card";
import { ExploreSearch } from "@/components/explore-search";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Explore courses \u2014 Tubinator",
  description:
    "Browse community-made, AI-generated learning paths on any topic. Free to start learning instantly.",
  openGraph: {
    title: "Explore courses on Tubinator",
    description:
      "Browse community-made, AI-generated learning paths on any topic.",
  },
};

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const q = searchParams.q || "";
  const courses = await listPublicCourses(q);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header>
        <h1 className="font-display text-3xl font-bold">Explore courses</h1>
        <p className="mt-1 text-white/50">
          Community-made learning paths. Start any one in a tap.
        </p>
      </header>

      <div className="mt-6">
        <ExploreSearch initial={q} />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {courses.length === 0 && (
          <Card className="text-center sm:col-span-2 lg:col-span-3">
            <p className="text-white/60">
              {q
                ? `No public courses match \u201c${q}\u201d yet.`
                : "No public courses yet. Be the first to share one!"}
            </p>
          </Card>
        )}
        {courses.map((c) => (
          <Link key={c.id} href={c.slug ? `/c/${c.slug}` : `/courses/${c.id}`}>
            <Card className="flex h-full flex-col transition hover:scale-[1.02]">
              <span className="text-xs uppercase tracking-wide text-white/40">
                {c.level}
              </span>
              <h3 className="mt-1 text-lg font-semibold">{c.title}</h3>
              <p className="mt-1 line-clamp-2 text-sm text-white/50">{c.goal}</p>
              <p className="mt-auto pt-4 text-xs text-white/40">
                {c.lessons} lessons · {c.learners}{" "}
                {c.learners === 1 ? "learner" : "learners"}
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
