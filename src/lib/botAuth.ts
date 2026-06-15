import { NextResponse } from "next/server";

/**
 * Validates the shared bot secret sent by the Telegram bot service.
 * The bot is trusted infrastructure (same Docker network), so a static bearer
 * secret is sufficient; users are identified by their Telegram ID in the body.
 */
export function checkBotSecret(req: Request): NextResponse | null {
  const expected = process.env.BOT_API_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "BOT_API_SECRET not configured on server" },
      { status: 500 },
    );
  }
  const header = req.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "");
  if (token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
