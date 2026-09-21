import { getTranslations } from "next-intl/server";

import {
  ProviderDirectory,
  type ProviderDirectoryCopy,
} from "@/components/provider-workspace/provider-directory";

export default async function ClientsPage() {
  const t = await getTranslations("ProviderWorkspace");
  return (
    <ProviderDirectory
      kind="clients"
      copy={t.raw("clients") as ProviderDirectoryCopy}
    />
  );
}
