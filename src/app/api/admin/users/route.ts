import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminUser } from "@/lib/requireAdmin";
import { isAdminEmail } from "@/lib/admin";

export const dynamic = "force-dynamic";

// List all users for the admin dashboard.
export async function GET() {
  const admin = await getAdminUser();
  if (!admin)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      telegramId: true,
      emailVerified: true,
      banned: true,
      dailyGenCount: true,
      dailyGenLimit: true,
      createdAt: true,
      _count: { select: { courses: true, enrollments: true } },
    },
  });

  return NextResponse.json({
    users: users.map((u) => ({
      ...u,
      emailVerified: Boolean(u.emailVerified),
      isAdmin: isAdminEmail(u.email),
    })),
  });
}
