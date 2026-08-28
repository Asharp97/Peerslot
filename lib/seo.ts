import type { Metadata } from "next";

import { routing, type AppLocale } from "@/i18n/routing";

type SiteUrlEnvironment = Readonly<Record<string, string | undefined>>;

const LOCAL_SITE_URL = "http://localhost:3000";

export function resolveSiteUrl(
  environment: SiteUrlEnvironment = process.env,
): URL {
  const configuredUrl =
    environment.NEXT_PUBLIC_SITE_URL?.trim() ||
    environment.BETTER_AUTH_URL?.trim() ||
    (environment.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${environment.VERCEL_PROJECT_PRODUCTION_URL}`
      : LOCAL_SITE_URL);

  let url: URL;

  try {
    url = new URL(configuredUrl);
  } catch {
    throw new Error(
      "URL must be an absolute http:// or https:// URL.",
    );
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(
      "URL must be an absolute http:// or https:// URL.",
    );
  }

  return new URL("/", url.origin);
}

export function createLocalizedAlternates(
  locale: AppLocale,
  pathname = "/",
  environment: SiteUrlEnvironment = process.env,
): NonNullable<Metadata["alternates"]> {
  const siteUrl = resolveSiteUrl(environment);
  const routeSuffix = normalizePathname(pathname);
  const localizedUrl = (targetLocale: AppLocale) =>
    new URL(`/${targetLocale}${routeSuffix}`, siteUrl).toString();

  const languages = Object.fromEntries(
    routing.locales.map((targetLocale) => [
      targetLocale,
      localizedUrl(targetLocale),
    ]),
  );

  return {
    canonical: localizedUrl(locale),
    languages: {
      ...languages,
      "x-default": localizedUrl(routing.defaultLocale),
    },
  };
}

function normalizePathname(pathname: string) {
  const normalized = pathname.trim();

  if (!normalized || normalized === "/") return "";

  return `/${normalized.replace(/^\/+|\/+$/g, "")}`;
}
