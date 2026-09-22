import { getTranslations } from "next-intl/server";

import { MyAppointmentsPage, type MyAppointmentsPageCopy } from "@/components/my-appointments-page";
import type { AppointmentsCopy } from "@/components/appointments/appointment-agenda";

export default async function MyAppointmentsRoute({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("Account");
  const consent = await getTranslations("ProviderAuth.flow");
  const { error } = await searchParams;

  return (
    <MyAppointmentsPage
      appointmentsCopy={t.raw("appointments") as AppointmentsCopy}
      copy={t.raw("controls") as MyAppointmentsPageCopy}
      locale={locale}
      initialAuthError={Boolean(error)}
      consentCopy={{
        consentPrefix: consent("consentPrefix"),
        consentJoin: consent("consentJoin"),
        termsLink: consent("termsLink"),
        privacyLink: consent("privacyLink"),
      }}
    />
  );
}
