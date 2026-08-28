import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import {
  LegalDocument,
  type LegalSection,
} from "@/components/legal-document";
import { routing } from "@/i18n/routing";
import { createLocalizedAlternates } from "@/lib/seo";

type LegalPolicyNamespace =
  | "Legal.cookies"
  | "Legal.privacy"
  | "Legal.terms";

export type LegalPolicyPageProps = {
  params: Promise<{ locale: string }>;
};

export async function createLegalPolicyMetadata(
  params: LegalPolicyPageProps["params"],
  namespace: LegalPolicyNamespace,
  pathname: string,
): Promise<Metadata> {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) notFound();

  const t = await getTranslations({ locale, namespace });

  return {
    title: t("title"),
    description: t("introduction"),
    alternates: createLocalizedAlternates(locale, pathname),
  };
}

export async function LegalPolicyPage({
  namespace,
}: {
  namespace: LegalPolicyNamespace;
}) {
  const t = await getTranslations(namespace);

  return (
    <LegalDocument
      aria-label={t("title")}
      eyebrow={t("eyebrow")}
      introduction={t("introduction")}
      sections={t.raw("sections") as LegalSection[]}
      title={t("title")}
      updatedAt={t("updatedAt")}
    />
  );
}
