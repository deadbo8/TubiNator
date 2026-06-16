import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getStats } from "@/lib/gamification";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id as string;

  const stats = await getStats(userId);
  const levelStyle = { width: stats.levelPct + "%" };

  const enrollments = await prisma.enrollment.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      course: {
        include: {
          modules: {
            include: {
              lessons: { include: { progress: { where: { userId } } } },
            },
          },
        },
      },
    },
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Your courses</h1>
          <p className="text-white/50">
            Welcome back, {session?.user?.name || "learner"}.
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/explore">
            <Button variant="outline">Explore</Button>
          </Link>
          <Link href="/generate">
            <Button>+ New course</Button>
          </Link>
        </div>
      </header>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card className="flex items-center gap-4">
          <span className="text-3xl">⚡</span>
          <div className="w-full">
            <p className="text-sm text-white/50">Level {stats.level}</p>
            <p className="text-xl font-semibold">{stats.xp} XP</p>
            <div className="mt-2 h-1.5 w-full rounded-full bg-white/10">
              <div
                className="h-1.5 rounded-full bg-[hsl(var(--primary))]"
                style={levelStyle}
              />
            </div>
          </div>
        </Card>
        <Card className="flex items-center gap-4">
          <span className="text-3xl">🔥</span>
          <div>
            <p className="text-sm text-white/50">Day streak</p>
            <p className="text-xl font-semibold">{stats.streak}</p>
            <p className="text-xs text-white/40">Best: {stats.longestStreak}</p>
          </div>
        </Card>
        <Link href="/review">
          <Card className="flex h-full items-center gap-4 transition hover:scale-[1.02]">
            <span className="text-3xl">🧠</span>
            <div>
              <p className="text-sm text-white/50">Reviews due</p>
              <p className="text-xl font-semibold">{stats.dueReviews}</p>
              <p className="text-xs text-[hsl(var(--primary))]">
                {stats.dueReviews > 0 ? "Start review →" : "All caught up"}
              </p>
            </div>
          </Card>
        </Link>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {enrollments.length === 0 && (
          <Card className="text-center sm:col-span-2">
            <p className="text-white/60">
              No courses yet. Generate your first one!
            </p>
            <Link href="/generate">
              <Button className="mt-4">Create a course</Button>
            </Link>
          </Card>
        )}
        {enrollments.map(({ course }) => {
          const lessons = course.modules.flatMap((m) => m.lessons);
          const done = lessons.filter((l) => l.progress[0]?.completed).length;
          const pct = lessons.length
            ? Math.round((done / lessons.length) * 100)
            : 0;
          return (
            <Link key={course.id} href={`/courses/${course.id}`}>
              <Card className="h-full transition hover:scale-[1.02]">
                <span className="text-xs uppercase tracking-wide text-white/40">
                  {course.level}
                </span>
                <h3 className="mt-1 text-xl font-semibold">{course.title}</h3>
                <p className="mt-1 text-sm text-white/50">{course.topic}</p>
                <div className="mt-4 h-2 w-full rounded-full bg-white/10">
                  <div
                    className="h-2 rounded-full bg-[hsl(var(--primary))]"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-white/40">
                  {done}/{lessons.length} lessons · {pct}%
                </p>
              </Card>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
