import { getTranslations } from "next-intl/server";

import { AccountPage, type AccountPageCopy } from "@/components/account-page";
import { PublicSiteLayout } from "@/components/public-site-layout";

export default async function AccountRoute({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("Account");

  return (
    <PublicSiteLayout>
      <AccountPage
        copy={t.raw("controls") as AccountPageCopy}
        locale={locale}
      />
    </PublicSiteLayout>
  );
}
