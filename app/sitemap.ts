import type { MetadataRoute } from "next";

import { routing, type AppLocale } from "@/i18n/routing";
import { resolveSiteUrl } from "@/lib/seo";

const publicPaths = [
  "/",
  "/policy/terms-agreements",
  "/policy/privacy",
  "/policy/cookies",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = resolveSiteUrl();

  return publicPaths.flatMap((pathname) =>
    routing.locales.map((locale) => {
      const url = new URL(`/${locale}${pathname === "/" ? "" : pathname}`, siteUrl).toString();
      const languages = Object.fromEntries(
        routing.locales.map((targetLocale: AppLocale) => [
          targetLocale,
          new URL(
            `/${targetLocale}${pathname === "/" ? "" : pathname}`,
            siteUrl,
          ).toString(),
        ]),
      );

      return {
        url,
        alternates: {
          languages: {
            ...languages,
            "x-default": languages[routing.defaultLocale],
          },
        },
      };
    }),
  );
}
