type DatabaseEnvironment = Record<string, string | undefined>;

export function resolveDatabaseUrl(env: DatabaseEnvironment = process.env) {
  if (env.VERCEL_ENV === "preview") {
    const previewUrl = env.PREVIEW_DATABASE_URL?.trim();
    if (!previewUrl) {
      throw new Error(
        "Preview deployment blocked: configure PREVIEW_DATABASE_URL with a non-production Neon branch.",
      );
    }

    const productionUrls = [
      env.PRODUCTION_DATABASE_URL?.trim(),
      env.DATABASE_URL?.trim(),
    ].filter(Boolean);
    if (productionUrls.includes(previewUrl)) {
      throw new Error(
        "Preview deployment blocked: PREVIEW_DATABASE_URL must not match a production database URL.",
      );
    }

    return previewUrl;
  }

  const databaseUrl = env.DATABASE_URL?.trim() || env.db_url?.trim();
  if (!databaseUrl) {
    throw new Error(
      "Missing DATABASE_URL. Add your Neon connection string to .env.local.",
    );
  }

  return databaseUrl;
}
