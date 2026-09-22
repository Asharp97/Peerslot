import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import {
  ProviderShell,
  type ProviderShellCopy,
} from "@/components/provider-workspace/provider-shell";
import { routing } from "@/i18n/routing";

export default async function ProviderLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);
  const t = await getTranslations("ProviderWorkspace");
  const account = await getTranslations("Account");
  const shell = t.raw("shell") as ProviderShellCopy;
  const settings = t.raw("settings") as { googleMeet: ProviderShellCopy["accountMenu"]["googleMeet"] };
  const accountControls = account.raw("controls") as ProviderShellCopy["accountMenu"]["accountData"];

  return (
    <ProviderShell
      copy={{
        ...shell,
        accountMenu: {
          ...shell.accountMenu,
          googleMeet: settings.googleMeet,
          accountData: accountControls,
        },
      }}>
      {children}
    </ProviderShell>
  );
}
