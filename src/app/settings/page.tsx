"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SettingsPage() {
  const [groqMask, setGroqMask] = useState<string | null>(null);
  const [ytMask, setYtMask] = useState<string | null>(null);
  const [groq, setGroq] = useState("");
  const [yt, setYt] = useState("");
  const [saved, setSaved] = useState(false);

  async function refresh() {
    const d = await fetch("/api/keys").then((r) => r.json());
    setGroqMask(d.groq);
    setYtMask(d.youtube);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function save() {
    setSaved(false);
    await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(groq ? { groqApiKey: groq } : {}),
        ...(yt ? { youtubeApiKey: yt } : {}),
      }),
    });
    setSaved(true);
    setGroq("");
    setYt("");
    refresh();
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-10">
      <Link href="/dashboard" className="text-sm text-white/50 hover:underline">
        Back to dashboard
      </Link>
      <h1 className="mt-3 text-3xl font-bold">Settings</h1>
      <Card className="mt-6">
        <h2 className="text-lg font-semibold">Your API keys (optional)</h2>
        <p className="mt-1 text-sm text-white/50">
          Add your own keys to bypass daily limits and run on your own quota.
          Keys are encrypted at rest and never shown again.
        </p>
        <div className="mt-5 space-y-4">
          <div>
            <label className="text-sm text-white/70">
              Groq API key{" "}
              {groqMask && (
                <span className="text-white/40">(current: {groqMask})</span>
              )}
            </label>
            <Input
              className="mt-1"
              placeholder="gsk_..."
              value={groq}
              onChange={(e) => setGroq(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm text-white/70">
              YouTube Data API key{" "}
              {ytMask && (
                <span className="text-white/40">(current: {ytMask})</span>
              )}
            </label>
            <Input
              className="mt-1"
              placeholder="AIza..."
              value={yt}
              onChange={(e) => setYt(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={save}>Save keys</Button>
            {saved && <span className="text-sm text-green-400">Saved</span>}
          </div>
        </div>
      </Card>
    </main>
  );
}
