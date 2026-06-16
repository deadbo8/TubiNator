import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

const base =
  process.env.NEXTAUTH_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  "http://localhost:3000";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let courseEntries: MetadataRoute.Sitemap = [];
  try {
    const courses = await prisma.course.findMany({
      where: { isPublic: true, slug: { not: null } },
      select: { slug: true, publishedAt: true, createdAt: true },
      take: 1000,
    });
    courseEntries = courses.map((c) => ({
      url: `${base}/c/${c.slug}`,
      lastModified: c.publishedAt ?? c.createdAt,
      changeFrequency: "weekly",
      priority: 0.7,
    }));
  } catch {
    // DB not reachable at build time \u2014 ship static routes only.
  }

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/explore`, changeFrequency: "daily", priority: 0.9 },
  ];

  return [...staticEntries, ...courseEntries];
}
