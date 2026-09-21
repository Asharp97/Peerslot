import { redirect } from "next/navigation";

export default async function LegacyCalendarPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/provider/calendar`);
}
