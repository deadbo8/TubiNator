import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret, maskKey } from "@/lib/crypto";
import { z } from "zod";

const schema = z.object({
  groqApiKey: z.string().trim().optional().nullable(),
  youtubeApiKey: z.string().trim().optional().nullable(),
});

export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const mask = (enc: string | null | undefined) => {
    if (!enc) return null;
    try {
      return maskKey(decryptSecret(enc));
    } catch {
      return "\u2022\u2022\u2022\u2022";
    }
  };
  return NextResponse.json({
    groq: mask(user?.groqApiKey),
    youtube: mask(user?.youtubeApiKey),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const data: Record<string, string | null> = {};
  if (parsed.data.groqApiKey !== undefined) {
    data.groqApiKey = parsed.data.groqApiKey
      ? encryptSecret(parsed.data.groqApiKey)
      : null;
  }
  if (parsed.data.youtubeApiKey !== undefined) {
    data.youtubeApiKey = parsed.data.youtubeApiKey
      ? encryptSecret(parsed.data.youtubeApiKey)
      : null;
  }

  await prisma.user.update({ where: { id: userId }, data });
  return NextResponse.json({ ok: true });
}
