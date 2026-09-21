import { getTranslations } from "next-intl/server";

import {
  WorkspaceCalendar,
  type WorkspaceCalendarCopy,
} from "@/components/provider-workspace/workspace-calendar";

export default async function WorkspaceCalendarPage() {
  const t = await getTranslations("ProviderWorkspace");
  return (
    <WorkspaceCalendar
      copy={t.raw("calendar") as WorkspaceCalendarCopy}
    />
  );
}
