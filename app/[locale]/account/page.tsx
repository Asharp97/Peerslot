import { getTranslations } from "next-intl/server";

import { AccountPage, type AccountPageCopy } from "@/components/account-page";
import { PublicSiteLayout } from "@/components/public-site-layout";
import type { AppointmentsCopy } from "@/components/appointments/appointment-agenda";

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
        appointmentsCopy={t.raw("appointments") as AppointmentsCopy}
        copy={t.raw("controls") as AccountPageCopy}
        locale={locale}
      />
    </PublicSiteLayout>
  );
}
