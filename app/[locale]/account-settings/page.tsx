import { getLocale, getTranslations } from "next-intl/server";

import {
  AccountSettingsPage,
} from "@/components/account-settings-page";
import type { AccountMenuCopy } from "@/components/account-settings-copy";

export default async function AccountSettingsRoute() {
  const locale = await getLocale();
  const workspace = await getTranslations("ProviderWorkspace");
  const account = await getTranslations("Account");
  const menu = workspace.raw("shell.accountMenu") as AccountMenuCopy;
  const settings = workspace.raw("settings") as {
    googleMeet: AccountMenuCopy["googleMeet"];
  };
  const accountControls = account.raw("controls") as AccountMenuCopy["accountData"];

  return (
    <AccountSettingsPage
      copy={{
        ...menu,
        googleMeet: settings.googleMeet,
        accountData: accountControls,
      }}
      locale={locale}
    />
  );
}
