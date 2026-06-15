"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/utils";

export function LessonItem({ lesson }: { lesson: any }) {
  const [video, setVideo] = useState<any>(lesson.video);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState<boolean>(
    !!lesson.progress?.[0]?.completed,
  );
  const [error, setError] = useState("");

  async function loadVideo() {
    const next = !open;
    setOpen(next);
    if (!next || video) return;
    setLoading(true);
    setError("");
    const res = await fetch(`/api/lessons/${lesson.id}/video`, {
      method: "POST",
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Could not load video");
      return;
    }
    setVideo(data.video);
  }

  async function toggleComplete() {
    const next = !completed;
    setCompleted(next);
    await fetch(`/api/lessons/${lesson.id}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: next }),
    });
  }

  const embedUrl = "https://www.youtube.com/embed/" + (video?.youtubeId ?? "");
  const watchUrl =
    "https://www.youtube.com/watch?v=" + (video?.youtubeId ?? "");

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <button
              onClick={toggleComplete}
              aria-label="Toggle complete"
              className={`flex h-5 w-5 items-center justify-center rounded-full border text-xs ${completed ? "border-green-400 bg-green-400/20 text-green-400" : "border-white/30"}`}
            >
              {completed ? "✓" : ""}
            </button>
            <h3
              className={`font-medium ${completed ? "text-white/40 line-through" : ""}`}
            >
              {lesson.title}
            </h3>
          </div>
          <p className="mt-1 pl-7 text-sm text-white/50">
            {lesson.description}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={loadVideo}>
          {open ? "Hide" : "Watch"}
        </Button>
      </div>

      {open && (
        <div className="mt-4">
          {loading && (
            <p className="text-sm text-white/50">Finding the best video...</p>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
          {video && (
            <div>
              <div className="aspect-video w-full overflow-hidden rounded-xl">
                <iframe
                  className="h-full w-full"
                  src={embedUrl}
                  title={video.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
              <p className="mt-2 text-xs text-white/40">
                {video.channelName} · {formatDuration(video.duration)} ·{" "}
                <a
                  className="hover:underline"
                  target="_blank"
                  rel="noreferrer"
                  href={watchUrl}
                >
                  Open on YouTube
                </a>
              </p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
