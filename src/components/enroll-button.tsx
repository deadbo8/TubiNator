"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function EnrollButton({ courseId }: { courseId: string }) {
  const { status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function add() {
    if (status !== "authenticated") {
      router.push("/login?next=" + encodeURIComponent("/courses/" + courseId));
      return;
    }
    setLoading(true);
    const res = await fetch("/api/courses/" + courseId + "/enroll", {
      method: "POST",
    });
    setLoading(false);
    if (res.ok) router.push("/courses/" + courseId);
  }

  return (
    <Button onClick={add} disabled={loading}>
      {loading ? "Adding..." : "Add to my learning"}
    </Button>
  );
}
