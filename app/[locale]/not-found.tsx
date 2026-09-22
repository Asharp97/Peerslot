import { getTranslations } from "next-intl/server";

import { NotFoundPage } from "@/components/not-found-page";
import { PublicSiteLayout } from "@/components/public-site-layout";

export default async function LocalizedNotFound() {
  const t = await getTranslations("NotFound");
  return (
    <PublicSiteLayout>
      <NotFoundPage
        copy={{
          eyebrow: t("eyebrow"),
          title: t("title"),
          body: t("body"),
          home: t("home"),
          back: t("back"),
        }}
        homeHref="/"
      />
    </PublicSiteLayout>
  );
}
