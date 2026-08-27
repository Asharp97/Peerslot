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

type TermsPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: TermsPageProps): Promise<Metadata> {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) notFound();

  const t = await getTranslations({ locale, namespace: "Legal.terms" });

  return {
    title: t("title"),
    description: t("introduction"),
    alternates: createLocalizedAlternates(locale, "/policy/terms-agreements"),
  };
}

export default async function TermsAgreementsPage() {
  const t = await getTranslations("Legal.terms");

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
