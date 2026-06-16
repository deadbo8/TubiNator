"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

type Step = "request" | "reset";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  async function requestCode(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");
    const res = await fetch("/api/auth/forgot/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not send reset code");
      return;
    }
    setStep("reset");
    setInfo(`If an account exists for ${email}, a 6-digit code is on its way.`);
  }

  async function resetPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/forgot/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setLoading(false);
      setError(data.error || "Could not reset password");
      return;
    }
    const signin = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (signin?.error) router.push("/login");
    else router.push("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <Card className="w-full max-w-md">
        <h1 className="text-2xl font-semibold">Reset your password</h1>
        <p className="mt-1 text-sm text-white/50">
          {step === "request"
            ? "Enter your email and we'll send you a reset code."
            : "Enter the code we emailed you and choose a new password."}
        </p>

        {step === "request" ? (
          <form onSubmit={requestCode} className="mt-6 space-y-3">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading || !email}>
              {loading ? "Sending..." : "Send reset code"}
            </Button>
          </form>
        ) : (
          <form onSubmit={resetPassword} className="mt-6 space-y-3">
            <Input
              inputMode="numeric"
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="New password (min 8 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {info && <p className="text-sm text-white/60">{info}</p>}
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Resetting..." : "Reset password & sign in"}
            </Button>
            <button
              type="button"
              onClick={() => requestCode()}
              className="w-full text-center text-sm text-white/50 hover:underline"
            >
              Resend code
            </button>
          </form>
        )}

        <p className="mt-5 text-center text-sm text-white/50">
          <Link href="/login" className="hover:underline">
            Back to sign in
          </Link>
        </p>
      </Card>
    </main>
  );
}
