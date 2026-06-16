import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { setCourseVisibility } from "@/lib/catalog";
import { z } from "zod";

const schema = z.object({ isPublic: z.boolean() });

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const result = await setCourseVisibility(userId, params.id, parsed.data.isPublic);
  if (!result.ok)
    return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
