import type { MetadataRoute } from "next";

import { resolveSiteUrl } from "@/lib/seo";

/**
 * Keep authenticated and action routes out of search results. Public provider
 * booking pages are intentionally discovered through their shareable links,
 * rather than being enumerated here because their slugs live in the database.
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl = resolveSiteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/en", "/tr", "/en/book/", "/tr/book/"],
        disallow: [
          "/api/",
          "/en/provider",
          "/tr/provider",
          "/en/my-appointments",
          "/tr/my-appointments",
          "/en/account",
          "/tr/account",
          "/en/account-settings",
          "/tr/account-settings",
          "/en/auth/",
          "/tr/auth/",
        ],
      },
    ],
    sitemap: new URL("/sitemap.xml", siteUrl).toString(),
  };
}
