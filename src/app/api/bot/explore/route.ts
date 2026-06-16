import { NextResponse } from "next/server";
import { checkBotSecret } from "@/lib/botAuth";
import { listPublicCourses } from "@/lib/catalog";

export async function GET(req: Request) {
  const unauth = checkBotSecret(req);
  if (unauth) return unauth;

  const q = new URL(req.url).searchParams.get("q") || undefined;
  const courses = await listPublicCourses(q);
  return NextResponse.json({ courses });
}
