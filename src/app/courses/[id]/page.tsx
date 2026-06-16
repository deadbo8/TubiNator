"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LessonItem } from "@/components/lesson-item";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function CoursePage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [course, setCourse] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthor, setIsAuthor] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [slug, setSlug] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/courses/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setCourse(d.course);
        setIsAuthor(Boolean(d.isAuthor));
        setIsPublic(Boolean(d.isPublic));
        setSlug(d.slug ?? null);
        setLoading(false);
      });
  }, [id]);

  async function togglePublic() {
    setBusy(true);
    const res = await fetch(`/api/courses/${id}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublic: !isPublic }),
    })
      .then((r) => r.json())
      .catch(() => null);
    setBusy(false);
    if (res && !res.error) {
      setIsPublic(res.isPublic);
      setSlug(res.slug ?? null);
    }
  }

  function copyLink() {
    if (!slug) return;
    const url = `${window.location.origin}/c/${slug}`;
    navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

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

      {isAuthor && (
        <Card className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">
                {isPublic ? "🌐 Public course" : "🔒 Private course"}
              </p>
              <p className="text-sm text-white/50">
                {isPublic
                  ? "Anyone with the link can view and start this course."
                  : "Only you can see this course. Publish it to share."}
              </p>
            </div>
            <Button variant="outline" onClick={togglePublic} disabled={busy}>
              {busy ? "Saving..." : isPublic ? "Make private" : "Publish & share"}
            </Button>
          </div>
          {isPublic && slug && (
            <div className="mt-3 flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg bg-black/40 px-3 py-2 text-xs text-white/70">
                /c/{slug}
              </code>
              <Button size="sm" onClick={copyLink}>
                {copied ? "Copied!" : "Copy link"}
              </Button>
            </div>
          )}
        </Card>
      )}

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
