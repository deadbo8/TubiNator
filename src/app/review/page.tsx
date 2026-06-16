"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Review = {
  lessonId: string;
  title: string;
  description: string;
  courseTitle: string;
  courseId: string;
  video: { youtubeId: string; title: string } | null;
};

const cardMotion = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -24 },
  transition: { duration: 0.25 },
};

export default function ReviewPage() {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);
  const [xp, setXp] = useState(0);

  useEffect(() => {
    fetch("/api/reviews")
      .then((r) => r.json())
      .then((d) => setReviews(d.reviews || []));
  }, []);

  if (reviews === null)
    return <main className="p-10 text-center text-white/50">Loading reviews...</main>;

  const current = reviews[idx];
  const finished = idx >= reviews.length;
  const progressStyle = {
    width: (reviews.length ? (idx / reviews.length) * 100 : 0) + "%",
  };

  async function grade(remembered: boolean) {
    const lessonId = reviews![idx].lessonId;
    setRevealed(false);
    const res = await fetch("/api/reviews/" + lessonId, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ remembered }),
    })
      .then((r) => r.json())
      .catch(() => null);
    if (res?.reward?.xpAwarded) setXp((x) => x + res.reward.xpAwarded);
    setDone((d) => d + 1);
    setIdx((i) => i + 1);
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold">Daily review</h1>
        <Link href="/dashboard" className="text-sm text-white/50 hover:underline">
          Back to dashboard
        </Link>
      </div>
      <p className="mt-1 text-white/50">
        Strengthen what you've learned with spaced repetition.
      </p>

      {reviews.length > 0 && !finished && (
        <div className="mt-4 h-2 w-full rounded-full bg-white/10">
          <div
            className="h-2 rounded-full bg-[hsl(var(--primary))] transition-all"
            style={progressStyle}
          />
        </div>
      )}

      {reviews.length === 0 && (
        <Card className="mt-8 text-center">
          <p className="text-4xl">✨</p>
          <p className="mt-3 text-white/70">
            Nothing due right now. Complete more lessons and check back tomorrow!
          </p>
          <Link href="/dashboard">
            <Button className="mt-4">Back to courses</Button>
          </Link>
        </Card>
      )}

      {finished && reviews.length > 0 && (
        <Card className="mt-8 text-center">
          <p className="text-4xl">🎉</p>
          <h2 className="mt-3 text-xl font-semibold">Review complete!</h2>
          <p className="mt-1 text-white/60">
            You reviewed {done} {done === 1 ? "lesson" : "lessons"} and earned{" "}
            <span className="text-[hsl(var(--primary))]">+{xp} XP</span>.
          </p>
          <Link href="/dashboard">
            <Button className="mt-4">Back to dashboard</Button>
          </Link>
        </Card>
      )}

      <AnimatePresence mode="wait">
        {current && !finished && (
          <motion.div key={current.lessonId} {...cardMotion}>
            <Card className="mt-8">
              <span className="text-xs uppercase tracking-wide text-white/40">
                {current.courseTitle}
              </span>
              <h2 className="mt-1 text-2xl font-semibold">{current.title}</h2>

              {!revealed ? (
                <div className="mt-8 text-center">
                  <p className="text-white/50">
                    Can you recall what this lesson covered?
                  </p>
                  <Button className="mt-4" onClick={() => setRevealed(true)}>
                    Show answer
                  </Button>
                </div>
              ) : (
                <div className="mt-4">
                  <p className="text-white/70">{current.description}</p>
                  {current.video && (
                    <a
                      href={"https://www.youtube.com/watch?v=" + current.video.youtubeId}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-block text-sm text-[hsl(var(--primary))] hover:underline"
                    >
                      ▶ Rewatch: {current.video.title}
                    </a>
                  )}
                  <div className="mt-6 flex gap-3">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => grade(false)}
                    >
                      😕 Forgot
                    </Button>
                    <Button className="flex-1" onClick={() => grade(true)}>
                      😊 Remembered
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
