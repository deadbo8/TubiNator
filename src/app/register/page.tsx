"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

type Step = "form" | "verify";

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Registration failed");
      return;
    }
    setInfo(`We sent a 6-digit code to ${email}.`);
    setStep("verify");
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Verification failed");
      setLoading(false);
      return;
    }
    // Verified — sign in with the password they just set.
    const signin = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (signin?.error) {
      setInfo("Email verified! Please sign in.");
      router.push("/login");
      return;
    }
    router.push("/dashboard");
  }

  async function resend() {
    setError("");
    setInfo("");
    const res = await fetch("/api/auth/otp/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, purpose: "verify" }),
    });
    setInfo(res.ok ? "A new code is on its way." : "Could not resend code.");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <Card className="w-full max-w-md">
        {step === "form" ? (
          <>
            <h1 className="text-2xl font-semibold">Create your account</h1>
            <form onSubmit={handleRegister} className="mt-6 space-y-3">
              <Input
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Input
                type="password"
                placeholder="Password (min 6 chars)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {error && <p className="text-sm text-red-400">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Creating..." : "Create account"}
              </Button>
            </form>
            <Button
              className="mt-3 w-full"
              variant="outline"
              onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
            >
              Continue with Google
            </Button>
            <p className="mt-4 text-center text-sm text-white/50">
              Already have an account?{" "}
              <Link
                href="/login"
                className="text-[hsl(var(--primary))] hover:underline"
              >
                Sign in
              </Link>
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold">Verify your email</h1>
            {info && <p className="mt-1 text-sm text-white/60">{info}</p>}
            <form onSubmit={handleVerify} className="mt-6 space-y-3">
              <Input
                inputMode="numeric"
                placeholder="6-digit code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
              {error && <p className="text-sm text-red-400">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Verifying..." : "Verify & continue"}
              </Button>
            </form>
            <button
              onClick={resend}
              className="mt-4 w-full text-center text-sm text-white/50 hover:underline"
            >
              Didn&apos;t get it? Resend code
            </button>
          </>
        )}
      </Card>
    </main>
  );
}
