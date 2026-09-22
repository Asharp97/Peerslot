import { getTranslations } from "next-intl/server";

import {
  DashboardLayout,
  type DashboardLayoutCopy,
} from "@/components/dashboard-layout";

export default async function MyAppointmentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("ProviderWorkspace");

  return (
    <DashboardLayout copy={t.raw("shell") as DashboardLayoutCopy}>
      {children}
    </DashboardLayout>
  );
}
