import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { LanguageSwitcher } from "@/components/language-switcher";
import { Link } from "@/i18n/navigation";

type NavigationItem = { label: string; href: string };

export async function PublicSiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("Home");
  const navigation = t.raw("navigation") as NavigationItem[];
  const footerLinks = t.raw("footer.links") as NavigationItem[];

  return (
    <div className="flex min-h-screen flex-col overflow-hidden bg-lumen-cream text-vast-ink">
      <a
        className="fixed top-3 left-3 z-50 -translate-y-[160%] rounded-xl border-2 border-vast-ink bg-lavender-whisper px-4 py-2.5 font-semibold transition-transform focus:translate-y-0"
        href="#main-content"
      >
        {t("skipToContent")}
      </a>

      <header className="relative z-20 mx-auto w-full max-w-[1240px] px-5 pt-6 max-sm:px-3 max-sm:pt-3">
        <nav
          aria-label={t("mainNavigationLabel")}
          className="flex min-h-[68px] items-center gap-8 rounded-full border-2 border-vast-ink bg-lumen-cream py-1.5 pr-[7px] pl-[22px] max-sm:min-h-[60px] max-sm:justify-between max-sm:pl-4"
        >
          <Link
            aria-label={t("brandHomeLabel")}
            className="inline-flex shrink-0 items-center gap-2.5 text-[19px] font-bold tracking-[-0.4px] max-sm:text-[17px]"
            href="/"
          >
            <BrandMark />
            <span>PeerSlot</span>
          </Link>

          <div className="flex flex-1 items-center justify-center gap-[clamp(18px,2.4vw,34px)] max-lg:hidden">
            {navigation.map((item) => (
              <Link
                className="text-sm font-medium text-charcoal underline-offset-4 hover:underline"
                href={item.href}
                key={item.label}
              >
                {item.label}
              </Link>
            ))}
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <LanguageSwitcher
              label={t("languageSwitcher.label")}
              localeLabels={{
                en: t("languageSwitcher.english"),
                tr: t("languageSwitcher.turkish"),
              }}
            />
            <Link
              aria-label={t("headerCta")}
              className="inline-flex min-h-13 items-center justify-center gap-2 rounded-3xl border-2 border-vast-ink bg-lavender-whisper px-4.5 text-sm leading-none font-semibold transition duration-200 hover:-translate-y-0.5 hover:bg-ember-glow max-sm:min-h-[42px] max-sm:min-w-[42px] max-sm:px-2 max-sm:text-xs"
              href="/auth/provider?mode=sign-in"
            >
              <span>{t("headerCta")}</span>
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
          </div>
        </nav>
      </header>

      <div className="flex flex-1 flex-col">{children}</div>

      <footer className="bg-vast-ink px-5 pt-16 pb-10 text-lumen-cream">
        <div className="mx-auto grid w-full max-w-[1200px] grid-cols-[1fr_auto_auto] items-end gap-16 max-md:grid-cols-1 max-md:items-start max-md:gap-8">
          <div>
            <Link
              className="inline-flex items-center gap-2.5 text-[19px] font-bold tracking-[-0.4px]"
              href="/"
            >
              <BrandMark />
              <span>PeerSlot</span>
            </Link>
            <p className="mt-3.5 text-sm text-[#b9b9ab]">
              {t("footer.tagline")}
            </p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-4 max-sm:flex-col">
            {footerLinks.map((item) => (
              <Link
                className="text-sm font-medium underline-offset-4 hover:underline"
                href={item.href}
                key={item.label}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <p className="text-xs text-[#b9b9ab]">
            {t("footer.copyright", { year: new Date().getFullYear() })}
          </p>
        </div>
      </footer>
    </div>
  );
}

function BrandMark() {
  return (
    <span aria-hidden="true" className="inline-flex h-6 w-6 items-end gap-0.75">
      <span className="h-3 w-1.5 rounded-full border-2 border-current bg-lavender-whisper" />
      <span className="h-5.5 w-1.5 rounded-full border-2 border-current bg-lavender-whisper" />
      <span className="h-4 w-1.5 rounded-full border-2 border-current bg-ember-glow" />
    </span>
  );
}
