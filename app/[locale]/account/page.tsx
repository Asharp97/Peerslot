import { redirect } from "next/navigation";

export default async function LegacyAccountRoute({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/my-appointments`);
}
