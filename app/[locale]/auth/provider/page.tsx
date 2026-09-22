import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { ProviderAuthFlow } from "@/components/provider-auth-flow";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

type ProviderAuthPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ mode?: string; error?: string }>;
};

export default async function ProviderAuthPage({
  params,
  searchParams,
}: ProviderAuthPageProps) {
  const { locale } = await params;
  const { mode, error } = await searchParams;

  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);
  const t = await getTranslations("ProviderAuth");

  return (
    <main className="grid min-h-screen place-items-center bg-lumen-cream px-4 py-10 text-vast-ink">
      <div className="w-full max-w-5xl overflow-hidden rounded-[32px] border-2 border-vast-ink bg-white shadow-[8px_8px_0_var(--color-vast-ink)]">
        <div className="grid lg:grid-cols-[0.85fr_1.15fr]">
          <section className="flex min-h-150 flex-col justify-between bg-forest-ink p-8 text-lumen-cream sm:p-12">
            <div>
              <Link
                className="inline-flex items-center gap-2 text-sm font-bold"
                href="/"
              >
                <span className="grid size-7 place-items-center rounded-lg bg-ember-glow text-vast-ink">
                  P
                </span>
                PeerSlot
              </Link>
              <p className="mt-20 text-xs font-bold tracking-[0.14em] text-ember-glow uppercase">
                {t("eyebrow")}
              </p>
              <h1 className="mt-4 font-display text-5xl leading-[0.96] tracking-[-0.04em] sm:text-6xl">
                {t("title")}
              </h1>
              <p className="mt-6 max-w-md text-base leading-7 text-[#e3e1d5]">
                {t("body")}
              </p>
            </div>
            {/* <div className="rounded-2xl border border-[#4f857e] bg-[#0b5d53] p-5">
              <LockKeyhole
                className="text-ember-glow"
                size={22}
                aria-hidden="true"
              />
              <p className="mt-3 text-sm leading-6 text-[#e3e1d5]">
                {t("securityNote")}
              </p>
            </div> */}
          </section>

          <section className="p-7 sm:p-12 lg:p-14">
            <ProviderAuthFlow
              locale={locale}
              initialMode={mode === "sign-in" ? "sign-in" : "register"}
              initialAuthError={Boolean(error)}
              copy={
                t.raw("flow") as Parameters<typeof ProviderAuthFlow>[0]["copy"]
              }
            />
          </section>
        </div>
      </div>
    </main>
  );
}
