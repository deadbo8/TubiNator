import { NextResponse } from "next/server";
import { checkBotSecret } from "@/lib/botAuth";
import { ServiceError } from "@/lib/courseService";
import { getBotAccount } from "@/lib/botAccount";

export async function GET(req: Request) {
  const unauth = checkBotSecret(req);
  if (unauth) return unauth;

  const url = new URL(req.url);
  const telegramId = url.searchParams.get("telegramId");
  const name = url.searchParams.get("name") || undefined;
  if (!telegramId)
    return NextResponse.json({ error: "telegramId required" }, { status: 400 });

  try {
    const account = await getBotAccount(telegramId, name);
    return NextResponse.json({ account });
  } catch (e) {
    if (e instanceof ServiceError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
