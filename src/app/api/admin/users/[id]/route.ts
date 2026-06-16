import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAdminUser } from "@/lib/requireAdmin";

const schema = z.object({
  dailyGenLimit: z.number().int().min(0).max(100000).nullable().optional(),
  banned: z.boolean().optional(),
});

// Update a user's per-day limit override or banned status.
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const admin = await getAdminUser();
  if (!admin)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  if (params.id === admin.id && parsed.data.banned === true)
    return NextResponse.json(
      { error: "You can't ban yourself" },
      { status: 400 },
    );

  const data: Record<string, unknown> = {};
  if (parsed.data.dailyGenLimit !== undefined)
    data.dailyGenLimit = parsed.data.dailyGenLimit;
  if (parsed.data.banned !== undefined) data.banned = parsed.data.banned;

  const user = await prisma.user.update({
    where: { id: params.id },
    data,
    select: { id: true, banned: true, dailyGenLimit: true },
  });
  return NextResponse.json({ user });
}

// Permanently delete a user account (cascades to their courses/progress/notes).
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const admin = await getAdminUser();
  if (!admin)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (params.id === admin.id)
    return NextResponse.json(
      { error: "You can't delete your own account here" },
      { status: 400 },
    );

  await prisma.user.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
