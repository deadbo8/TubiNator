"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

type Mode = "password" | "code";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error)
      setError("Invalid credentials, or your email isn't verified yet.");
    else router.push("/dashboard");
  }

  async function sendCode() {
    setLoading(true);
    setError("");
    setInfo("");
    const res = await fetch("/api/auth/otp/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, purpose: "login" }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not send code");
      return;
    }
    setCodeSent(true);
    setInfo(`We sent a 6-digit code to ${email}.`);
  }

  async function handleCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signIn("otp", { email, code, redirect: false });
    setLoading(false);
    if (res?.error) setError("Invalid or expired code");
    else router.push("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <Card className="w-full max-w-md">
        <h1 className="text-2xl font-semibold">Welcome back</h1>
        <p className="mt-1 text-sm text-white/50">
          Sign in to continue your learning journey.
        </p>

        <Button
          className="mt-6 w-full"
          variant="outline"
          onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
        >
          Continue with Google
        </Button>

        <div className="my-5 flex items-center gap-3 text-xs text-white/40">
          <div className="h-px flex-1 bg-white/10" /> OR
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <div className="mb-4 flex rounded-lg border border-white/10 p-1 text-sm">
          <button
            type="button"
            onClick={() => {
              setMode("password");
              setError("");
            }}
            className={`flex-1 rounded-md py-1.5 transition ${
              mode === "password" ? "bg-white/10 text-white" : "text-white/50"
            }`}
          >
            Password
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("code");
              setError("");
            }}
            className={`flex-1 rounded-md py-1.5 transition ${
              mode === "code" ? "bg-white/10 text-white" : "text-white/50"
            }`}
          >
            Email code
          </button>
        </div>

        {mode === "password" ? (
          <form onSubmit={handlePassword} className="space-y-3">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleCode} className="space-y-3">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            {codeSent && (
              <Input
                inputMode="numeric"
                placeholder="6-digit code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            )}
            {info && <p className="text-sm text-white/60">{info}</p>}
            {error && <p className="text-sm text-red-400">{error}</p>}
            {!codeSent ? (
              <Button
                type="button"
                className="w-full"
                disabled={loading || !email}
                onClick={sendCode}
              >
                {loading ? "Sending..." : "Send code"}
              </Button>
            ) : (
              <>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Verifying..." : "Sign in with code"}
                </Button>
                <button
                  type="button"
                  onClick={sendCode}
                  className="w-full text-center text-sm text-white/50 hover:underline"
                >
                  Resend code
                </button>
              </>
            )}
          </form>
        )}

        <p className="mt-4 text-center text-sm text-white/50">
          No account?{" "}
          <Link
            href="/register"
            className="text-[hsl(var(--primary))] hover:underline"
          >
            Create one
          </Link>
        </p>
      </Card>
    </main>
  );
}
