"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LessonItem } from "@/components/lesson-item";

export default function CoursePage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [course, setCourse] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/courses/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setCourse(d.course);
        setLoading(false);
      });
  }, [id]);

  if (loading)
    return <main className="p-10 text-center text-white/50">Loading...</main>;
  if (!course)
    return <main className="p-10 text-center">Course not found.</main>;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/dashboard" className="text-sm text-white/50 hover:underline">
        Back to dashboard
      </Link>
      <h1 className="mt-3 text-3xl font-bold">{course.title}</h1>
      <p className="text-white/50">
        {course.level} · {course.goal}
      </p>

      <div className="mt-8 space-y-8">
        {course.modules.map((m: any, i: number) => (
          <section key={m.id}>
            <h2 className="mb-3 text-xl font-semibold">
              {i + 1}. {m.title}
            </h2>
            <div className="space-y-3">
              {m.lessons.map((l: any) => (
                <LessonItem key={l.id} lesson={l} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
