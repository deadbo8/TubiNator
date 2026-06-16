import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";

export type Provider = "groq" | "youtube";

export type Resolution = { key: string; source: "user" | "house" };

/**
 * Resolve an API key for a user. Prefers the user's own (encrypted) key (BYOK),
 * falling back to the shared house key.
 */
export async function resolveKey(
  userId: string,
  provider: Provider,
): Promise<Resolution | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const enc = provider === "groq" ? user?.groqApiKey : user?.youtubeApiKey;
  if (enc) {
    try {
      return { key: decryptSecret(enc), source: "user" };
    } catch {
      // corrupt/old ciphertext -> fall back to house key
    }
  }
  const house =
    provider === "groq"
      ? process.env.GROQ_API_KEY
      : process.env.YOUTUBE_API_KEY;
  if (house) return { key: house, source: "house" };
  return null;
}

const HOUSE_DAILY_LIMIT = parseInt(process.env.HOUSE_DAILY_LIMIT || "5", 10);

/**
 * Enforce the house-key daily generation cap. Users running on their own key
 * bypass the limit. Increments the counter when allowed.
 */
export async function consumeHouseGeneration(
  userId: string,
  usingUserKey: boolean,
): Promise<{ allowed: boolean; remaining: number }> {
  if (usingUserKey) return { allowed: true, remaining: Infinity };

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { allowed: false, remaining: 0 };
  if (user.banned) return { allowed: false, remaining: 0 };

  // An admin-set per-user override takes precedence over the global house limit.
  const limit = user.dailyGenLimit ?? HOUSE_DAILY_LIMIT;

  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  const needsReset =
    !user.dailyGenResetAt ||
    now.getTime() - user.dailyGenResetAt.getTime() > dayMs;
  const currentCount = needsReset ? 0 : user.dailyGenCount;

  if (currentCount >= limit) {
    return { allowed: false, remaining: 0 };
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      dailyGenCount: currentCount + 1,
      dailyGenResetAt: needsReset ? now : user.dailyGenResetAt,
    },
  });

  return { allowed: true, remaining: limit - (currentCount + 1) };
}
