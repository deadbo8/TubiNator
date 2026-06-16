import type { MetadataRoute } from "next";

const base =
  process.env.NEXTAUTH_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/explore", "/c/"],
      disallow: ["/dashboard", "/settings", "/admin", "/generate", "/review", "/api/"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
