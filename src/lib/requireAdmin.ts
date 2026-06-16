import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/admin";

/**
 * Returns the signed-in user if they are an admin (email in ADMIN_EMAILS),
 * otherwise null. Use in admin-only API routes.
 */
export async function getAdminUser() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !isAdminEmail(user.email)) return null;
  return user;
}
