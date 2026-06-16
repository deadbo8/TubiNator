import { NextResponse } from "next/server";
import { checkBotSecret } from "@/lib/botAuth";
import { ServiceError } from "@/lib/courseService";
import { botAdminListUsers } from "@/lib/botAccount";

export async function GET(req: Request) {
  const unauth = checkBotSecret(req);
  if (unauth) return unauth;

  const telegramId = new URL(req.url).searchParams.get("telegramId");
  if (!telegramId)
    return NextResponse.json({ error: "telegramId required" }, { status: 400 });

  try {
    const users = await botAdminListUsers(telegramId);
    return NextResponse.json({ users });
  } catch (e) {
    if (e instanceof ServiceError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
