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
  const [reward, setReward] = useState<string>("");

  // Notes
  const [notesOpen, setNotesOpen] = useState(false);
  const [note, setNote] = useState("");
  const [noteLoaded, setNoteLoaded] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

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
    const res = await fetch(`/api/lessons/${lesson.id}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: next }),
    })
      .then((r) => r.json())
      .catch(() => null);
    if (res?.reward?.xpAwarded) {
      const r = res.reward;
      setReward(
        r.leveledUp
          ? `+${r.xpAwarded} XP \u00b7 Level ${r.level}! \ud83c\udf89`
          : `+${r.xpAwarded} XP \u00b7 \ud83d\udd25 ${r.streak}`,
      );
      setTimeout(() => setReward(""), 2500);
    }
  }

  async function toggleNotes() {
    const next = !notesOpen;
    setNotesOpen(next);
    if (next && !noteLoaded) {
      const res = await fetch(`/api/lessons/${lesson.id}/note`);
      const data = await res.json().catch(() => ({ content: "" }));
      setNote(data.content || "");
      setNoteLoaded(true);
    }
  }

  async function saveNote() {
    setNoteSaving(true);
    setNoteSaved(false);
    await fetch(`/api/lessons/${lesson.id}/note`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: note }),
    });
    setNoteSaving(false);
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 1500);
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
            {reward && (
              <span className="animate-pulse rounded-full bg-[hsl(var(--primary))]/20 px-2 py-0.5 text-xs font-semibold text-[hsl(var(--primary))]">
                {reward}
              </span>
            )}
          </div>
          <p className="mt-1 pl-7 text-sm text-white/50">
            {lesson.description}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            size="sm"
            variant={notesOpen ? "primary" : "outline"}
            onClick={toggleNotes}
          >
            Notes
          </Button>
          <Button size="sm" variant="outline" onClick={loadVideo}>
            {open ? "Hide" : "Watch"}
          </Button>
        </div>
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

      {notesOpen && (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-white/40">
              Your notes
            </span>
            {noteSaved && (
              <span className="text-xs text-green-400">Saved</span>
            )}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              noteLoaded ? "Jot down key takeaways from this lesson..." : "Loading..."
            }
            rows={4}
            className="w-full resize-y rounded-lg border border-white/15 bg-black/30 p-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/40"
          />
          <div className="mt-2 flex justify-end">
            <Button size="sm" onClick={saveNote} disabled={noteSaving}>
              {noteSaving ? "Saving..." : "Save note"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
