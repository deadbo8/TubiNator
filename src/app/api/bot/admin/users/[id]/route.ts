import { NextResponse } from "next/server";
import { z } from "zod";
import { checkBotSecret } from "@/lib/botAuth";
import { ServiceError } from "@/lib/courseService";
import { botAdminUpdateUser, botAdminDeleteUser } from "@/lib/botAccount";

const schema = z.object({
  telegramId: z.string().min(1),
  dailyGenLimit: z.number().int().min(0).max(100000).nullable().optional(),
  banned: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const unauth = checkBotSecret(req);
  if (unauth) return unauth;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    const user = await botAdminUpdateUser(parsed.data.telegramId, params.id, {
      dailyGenLimit: parsed.data.dailyGenLimit,
      banned: parsed.data.banned,
    });
    return NextResponse.json({ user });
  } catch (e) {
    if (e instanceof ServiceError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } },
) {
  const unauth = checkBotSecret(req);
  if (unauth) return unauth;

  const telegramId = new URL(req.url).searchParams.get("telegramId");
  if (!telegramId)
    return NextResponse.json({ error: "telegramId required" }, { status: 400 });

  try {
    const res = await botAdminDeleteUser(telegramId, params.id);
    return NextResponse.json(res);
  } catch (e) {
    if (e instanceof ServiceError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
