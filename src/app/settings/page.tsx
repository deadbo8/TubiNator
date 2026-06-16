"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Account = {
  name: string | null;
  email: string | null;
  hasPassword: boolean;
  emailVerified: boolean;
  isAdmin: boolean;
};

export default function SettingsPage() {
  const [account, setAccount] = useState<Account | null>(null);

  const [groqMask, setGroqMask] = useState<string | null>(null);
  const [ytMask, setYtMask] = useState<string | null>(null);
  const [groq, setGroq] = useState("");
  const [yt, setYt] = useState("");
  const [keysSaved, setKeysSaved] = useState(false);

  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");

  async function refresh() {
    const [keys, acct] = await Promise.all([
      fetch("/api/keys").then((r) => r.json()),
      fetch("/api/account").then((r) => r.json()),
    ]);
    setGroqMask(keys.groq);
    setYtMask(keys.youtube);
    setAccount(acct);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function saveKeys() {
    setKeysSaved(false);
    await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(groq ? { groqApiKey: groq } : {}),
        ...(yt ? { youtubeApiKey: yt } : {}),
      }),
    });
    setKeysSaved(true);
    setGroq("");
    setYt("");
    refresh();
  }

  async function clearKey(provider: "groq" | "youtube") {
    await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        provider === "groq" ? { groqApiKey: null } : { youtubeApiKey: null },
      ),
    });
    refresh();
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg("");
    setPwErr("");
    const res = await fetch("/api/account/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(account?.hasPassword ? { currentPassword: curPw } : {}),
        newPassword: newPw,
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setPwErr(d.error || "Could not update password");
      return;
    }
    setPwMsg("Password updated.");
    setCurPw("");
    setNewPw("");
    refresh();
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-10">
      <Link href="/dashboard" className="text-sm text-white/50 hover:underline">
        Back to dashboard
      </Link>
      <h1 className="mt-3 text-3xl font-bold">Settings</h1>

      {/* Profile */}
      <Card className="mt-6">
        <h2 className="text-lg font-semibold">Profile</h2>
        <div className="mt-3 space-y-1 text-sm text-white/70">
          <p>
            <span className="text-white/40">Name:</span>{" "}
            {account?.name || "\u2014"}
          </p>
          <p>
            <span className="text-white/40">Email:</span>{" "}
            {account?.email || "\u2014"}{" "}
            {account?.emailVerified ? (
              <span className="text-green-400">(verified)</span>
            ) : (
              <span className="text-yellow-400">(unverified)</span>
            )}
          </p>
          {account?.isAdmin && (
            <p className="text-[hsl(var(--primary))]">Admin access enabled</p>
          )}
        </div>
        {account?.isAdmin && (
          <Link
            href="/admin"
            className="mt-4 inline-block text-sm text-[hsl(var(--primary))] hover:underline"
          >
            Open admin dashboard →
          </Link>
        )}
      </Card>

      {/* Change password */}
      <Card className="mt-6">
        <h2 className="text-lg font-semibold">
          {account?.hasPassword ? "Change password" : "Set a password"}
        </h2>
        <p className="mt-1 text-sm text-white/50">
          {account?.hasPassword
            ? "Update the password you use to sign in."
            : "You signed in with Google. Set a password to also log in with email."}
        </p>
        <form onSubmit={changePassword} className="mt-4 space-y-3">
          {account?.hasPassword && (
            <Input
              type="password"
              placeholder="Current password"
              value={curPw}
              onChange={(e) => setCurPw(e.target.value)}
              required
            />
          )}
          <Input
            type="password"
            placeholder="New password (min 6 chars)"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            required
          />
          {pwErr && <p className="text-sm text-red-400">{pwErr}</p>}
          {pwMsg && <p className="text-sm text-green-400">{pwMsg}</p>}
          <Button type="submit">Save password</Button>
        </form>
      </Card>

      {/* API keys */}
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
            <div className="mt-1 flex gap-2">
              <Input
                placeholder="gsk_..."
                value={groq}
                onChange={(e) => setGroq(e.target.value)}
              />
              {groqMask && (
                <Button variant="outline" onClick={() => clearKey("groq")}>
                  Remove
                </Button>
              )}
            </div>
          </div>
          <div>
            <label className="text-sm text-white/70">
              YouTube Data API key{" "}
              {ytMask && (
                <span className="text-white/40">(current: {ytMask})</span>
              )}
            </label>
            <div className="mt-1 flex gap-2">
              <Input
                placeholder="AIza..."
                value={yt}
                onChange={(e) => setYt(e.target.value)}
              />
              {ytMask && (
                <Button variant="outline" onClick={() => clearKey("youtube")}>
                  Remove
                </Button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={saveKeys}>Save keys</Button>
            {keysSaved && <span className="text-sm text-green-400">Saved</span>}
          </div>
        </div>
      </Card>
    </main>
  );
}
