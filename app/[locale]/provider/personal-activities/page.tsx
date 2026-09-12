import { getTranslations } from "next-intl/server";
import {
  ProviderDirectory,
  type ProviderDirectoryCopy,
} from "@/components/provider-workspace/provider-directory";
export default async function Page() {
  const t = await getTranslations("ProviderWorkspace");
  return (
    <ProviderDirectory
      kind="activities"
      copy={t.raw("personalActivities") as ProviderDirectoryCopy}
    />
  );
}
