import { getTranslations } from "next-intl/server";

import { MyAppointmentsPage, type MyAppointmentsPageCopy } from "@/components/my-appointments-page";
import { PublicSiteLayout } from "@/components/public-site-layout";
import type { AppointmentsCopy } from "@/components/appointments/appointment-agenda";

export default async function MyAppointmentsRoute({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("Account");

  return (
    <PublicSiteLayout>
      <MyAppointmentsPage
        appointmentsCopy={t.raw("appointments") as AppointmentsCopy}
        copy={t.raw("controls") as MyAppointmentsPageCopy}
        locale={locale}
      />
    </PublicSiteLayout>
  );
}
