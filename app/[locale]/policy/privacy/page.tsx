import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { LegalDocument } from "@/components/legal-document";
import { routing } from "@/i18n/routing";
import { createLocalizedAlternates } from "@/lib/seo";

type LegalSection = {
  heading: string;
  paragraphs?: string[];
  items?: string[];
};

type PrivacyPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: PrivacyPageProps): Promise<Metadata> {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) notFound();

  const t = await getTranslations({ locale, namespace: "Legal.privacy" });

  return {
    title: t("title"),
    description: t("introduction"),
    alternates: createLocalizedAlternates(locale, "/policy/privacy"),
  };
}

export default async function PrivacyPage() {
  const t = await getTranslations("Legal.privacy");

  return (
    <div className="w-full">
      <LegalDocument
        aria-label={t("title")}
        eyebrow={t("eyebrow")}
        introduction={t("introduction")}
        sections={t.raw("sections") as LegalSection[]}
        title={t("title")}
        updatedAt={t("updatedAt")}
      />
    </div>
  );
}
