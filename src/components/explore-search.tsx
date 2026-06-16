"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ExploreSearch({ initial }: { initial: string }) {
  const [q, setQ] = useState(initial);
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const params = q.trim() ? "?q=" + encodeURIComponent(q.trim()) : "";
    router.push("/explore" + params);
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search topics, goals, skills..."
        className="glass-input w-full rounded-xl px-4 py-2.5 text-sm outline-none"
      />
      <button
        type="submit"
        className="rounded-xl bg-[hsl(var(--primary))] px-5 py-2.5 text-sm font-semibold text-black transition hover:opacity-90"
      >
        Search
      </button>
    </form>
  );
}
