"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

const LEVELS = ["Beginner", "Intermediate", "Advanced"] as const;

export default function GeneratePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState<(typeof LEVELS)[number]>("Beginner");
  const [goal, setGoal] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, level, goal }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Something went wrong");
      return;
    }
    router.push(`/courses/${data.courseId}`);
  }

  const fade = {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6">
      <Card>
        <div className="mb-6 flex gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-[hsl(var(--primary))]" : "bg-white/10"}`}
            />
          ))}
        </div>

        {step === 0 && (
          <motion.div {...fade}>
            <h2 className="text-2xl font-semibold">
              What do you want to learn?
            </h2>
            <Input
              className="mt-4"
              placeholder="e.g. React, Jazz piano, Machine learning"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
            <Button
              className="mt-6 w-full"
              disabled={topic.trim().length < 2}
              onClick={() => setStep(1)}
            >
              Next
            </Button>
          </motion.div>
        )}

        {step === 1 && (
          <motion.div {...fade}>
            <h2 className="text-2xl font-semibold">What is your level?</h2>
            <div className="mt-4 grid gap-3">
              {LEVELS.map((l) => (
                <button
                  key={l}
                  onClick={() => setLevel(l)}
                  className={`glass-input rounded-xl px-4 py-3 text-left transition ${level === l ? "border-[hsl(var(--primary))]" : ""}`}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="mt-6 flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStep(0)}
              >
                Back
              </Button>
              <Button className="flex-1" onClick={() => setStep(2)}>
                Next
              </Button>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div {...fade}>
            <h2 className="text-2xl font-semibold">What is your goal?</h2>
            <Input
              className="mt-4"
              placeholder="e.g. Build a portfolio project, pass an exam"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
            <div className="mt-6 flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStep(1)}
              >
                Back
              </Button>
              <Button
                className="flex-1"
                disabled={goal.trim().length < 2 || loading}
                onClick={generate}
              >
                {loading ? "Generating..." : "Generate course"}
              </Button>
            </div>
          </motion.div>
        )}
      </Card>
    </main>
  );
}
