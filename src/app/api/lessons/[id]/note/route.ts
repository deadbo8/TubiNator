import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({ content: z.string().max(10000) });

// Get the signed-in user's note for a lesson.
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const note = await prisma.note.findUnique({
    where: { userId_lessonId: { userId, lessonId: params.id } },
  });
  return NextResponse.json({ content: note?.content ?? "" });
}

// Create/update (or clear) the note for a lesson.
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

  const content = parsed.data.content.trim();
  if (!content) {
    await prisma.note
      .delete({ where: { userId_lessonId: { userId, lessonId: params.id } } })
      .catch(() => {});
    return NextResponse.json({ content: "" });
  }

  const note = await prisma.note.upsert({
    where: { userId_lessonId: { userId, lessonId: params.id } },
    update: { content },
    create: { userId, lessonId: params.id, content },
  });
  return NextResponse.json({ content: note.content });
}
