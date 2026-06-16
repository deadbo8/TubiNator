import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { generateNextLevelCourse, ServiceError } from "@/lib/courseService";

// Generate (or reuse) the next level up from this course, building on its
// modules. Beginner -> Intermediate -> Advanced.
export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await generateNextLevelCourse(userId, params.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const status = e instanceof ServiceError ? e.status : 500;
    const message =
      e instanceof Error ? e.message : "Could not generate the next level";
    return NextResponse.json({ error: message }, { status });
  }
}
