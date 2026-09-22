import { getTranslations } from "next-intl/server";

import {
  DashboardLayout,
  type DashboardLayoutCopy,
} from "@/components/dashboard-layout";

export default async function AccountSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("ProviderWorkspace");
  const account = await getTranslations("Account");
  const shell = t.raw("shell") as DashboardLayoutCopy;
  const settings = t.raw("settings") as {
    googleMeet: DashboardLayoutCopy["accountMenu"]["googleMeet"];
  };
  const accountControls = account.raw("controls") as DashboardLayoutCopy["accountMenu"]["accountData"];

  return (
    <DashboardLayout
      copy={{
        ...shell,
        accountMenu: {
          ...shell.accountMenu,
          googleMeet: settings.googleMeet,
          accountData: accountControls,
        },
      }}>
      {children}
    </DashboardLayout>
  );
}
