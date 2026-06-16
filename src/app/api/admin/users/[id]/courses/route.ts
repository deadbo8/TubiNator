import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/requireAdmin";
import { listUserCourses } from "@/lib/courseService";

export const dynamic = "force-dynamic";

// Admin: list the courses a particular user authored or is enrolled in.
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const admin = await getAdminUser();
  if (!admin)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const courses = await listUserCourses(params.id);
  return NextResponse.json({ courses });
}
