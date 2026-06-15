import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({ completed: z.boolean() });

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

  const progress = await prisma.progress.upsert({
    where: { userId_lessonId: { userId, lessonId: params.id } },
    update: { completed: parsed.data.completed },
    create: { userId, lessonId: params.id, completed: parsed.data.completed },
  });

  return NextResponse.json({ progress });
}
