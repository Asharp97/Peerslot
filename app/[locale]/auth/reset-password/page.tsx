import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { PasswordResetPage } from "@/components/password-reset-page";
import { routing } from "@/i18n/routing";

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("AuthRecovery");
  return (
    <PasswordResetPage
      copy={t.raw("reset") as Parameters<typeof PasswordResetPage>[0]["copy"]}
      invalidToken={!query.token || Boolean(query.error)}
      locale={locale}
      token={query.token ?? ""}
    />
  );
}
