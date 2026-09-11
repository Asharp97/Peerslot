import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { Clock3, Globe2 } from "lucide-react";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { db } from "@/db";
import {
  BookingRequestPicker,
  type BookingRequestCopy,
} from "@/components/booking/booking-request-picker";
import { bookingPages, providerProfiles } from "@/db/schema";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getAvailableTimesForPublishedBookingPage } from "@/lib/available-times";
import { localizeBookingTitle } from "@/lib/booking-title";
import { createLocalizedAlternates } from "@/lib/seo";

type BookingPageProps = {
  params: Promise<{ locale: string; slug: string }>;
};

export async function generateMetadata({
  params,
}: BookingPageProps): Promise<Metadata> {
  const { locale, slug } = await params;

  if (!hasLocale(routing.locales, locale)) notFound();

  return {
    alternates: createLocalizedAlternates(
      locale,
      `/book/${encodeURIComponent(slug)}`,
    ),
  };
}

export default async function BookingPage({ params }: BookingPageProps) {
  const { locale, slug } = await params;

  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);
  const t = await getTranslations("BookingPage");
  const [provider] = await db
    .select({
      bookingPageId: bookingPages.id,
      userId: providerProfiles.userId,
      displayName: providerProfiles.displayName,
      professionalTitle: providerProfiles.professionalTitle,
      title: bookingPages.title,
      timeZone: bookingPages.timeZone,
      duration: bookingPages.appointmentDurationMinutes,
    })
    .from(bookingPages)
    .innerJoin(
      providerProfiles,
      eq(providerProfiles.userId, bookingPages.providerId),
    )
    .where(and(eq(bookingPages.slug, slug), eq(bookingPages.isPublished, true)))
    .limit(1);

  if (!provider) notFound();

  const bookingTitle = localizeBookingTitle(
    provider.title,
    provider.displayName,
    locale,
  );

  const rangeStartsAt = new Date();
  const availability = await getAvailableTimesForPublishedBookingPage(slug, {
    startsAt: rangeStartsAt,
    endsAt: new Date(rangeStartsAt.getTime() + 30 * 24 * 60 * 60 * 1000),
  });
  const slots = availability?.availableTimes.slice(0, 12) ?? [];

  return (
    <main className="min-h-screen bg-lumen-cream px-4 py-8 text-vast-ink sm:py-14">
      <div className="mx-auto max-w-6xl">
        <Link
          className="inline-flex items-center gap-2 text-lg font-bold"
          href="/"
        >
          <span className="grid size-7 place-items-center rounded-lg bg-ember-glow text-sm">
            P
          </span>
          PeerSlot
        </Link>

        <div className="mt-10 grid overflow-hidden rounded-[32px] border-2 border-vast-ink bg-white shadow-[7px_7px_0_var(--color-vast-ink)] md:grid-cols-[0.7fr_1.3fr]">
          <section className="bg-forest-ink p-7 text-lumen-cream sm:p-10 md:min-h-180">
            <span className="grid size-16 place-items-center rounded-2xl bg-lavender-whisper font-display text-3xl text-vast-ink">
              {getInitials(provider.displayName)}
            </span>
            <p className="mt-8 text-xs font-bold tracking-[0.12em] text-ember-glow uppercase">
              {t("eyebrow")}
            </p>
            <h1 className="mt-3 font-display text-5xl leading-none tracking-[-0.04em]">
              {provider.displayName}
            </h1>
            <p className="mt-3 text-lg text-[#deddd1]">
              {provider.professionalTitle}
            </p>
            <dl className="mt-10 space-y-4 text-sm">
              <InfoRow
                icon={<Clock3 size={17} />}
                label={t("duration")}
                value={`${provider.duration} ${t("minutes")}`}
              />
              <InfoRow
                icon={<Globe2 size={17} />}
                label={t("timeZone")}
                value={provider.timeZone}
              />
            </dl>
          </section>

          <section className="p-6 sm:p-10 lg:p-12">
            <p className="text-[11px] font-bold tracking-[0.14em] text-black/40 uppercase">
              {t("availableTimes")}
            </p>
            <h2 className="font-display text-4xl tracking-[-0.03em]">
              {bookingTitle}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#62625a]">
              {t("availableTimesBody")}
            </p>

            {slots.length ? (
              <BookingRequestPicker
                bookingPageId={provider.bookingPageId}
                bookingTitle={bookingTitle}
                copy={
                  {
                    morning: t("morning"),
                    afternoon: t("afternoon"),
                    evening: t("evening"),
                    requestTitle: t("requestTitle"),
                    requestBody: t("requestBody"),
                    name: t("name"),
                    email: t("email"),
                    comment: t("comment"),
                    commentPlaceholder: t("commentPlaceholder"),
                    continue: t("continue"),
                    authTitle: t("authTitle"),
                    authBody: t("authBody"),
                    googleAction: t("googleAction"),
                    orEmail: t("orEmail"),
                    signInTab: t("signInTab"),
                    registerTab: t("registerTab"),
                    password: t("password"),
                    signInAction: t("signInAction"),
                    registerAction: t("registerAction"),
                    consentPrefix: t("consentPrefix"),
                    termsLink: t("termsLink"),
                    privacyLink: t("privacyLink"),
                    consentJoin: t("consentJoin"),
                    verifyTitle: t("verifyTitle"),
                    verifyBody: t.raw("verifyBody"),
                    verifyAction: t("verifyAction"),
                    confirmTitle: t("confirmTitle"),
                    confirmBody: t("confirmBody"),
                    bookingAs: t("bookingAs"),
                    confirmRequest: t("confirmRequest"),
                    sending: t("sending"),
                    requestedTitle: t("requestedTitle"),
                    requestedBody: t("requestedBody"),
                    requestError: t("requestError"),
                    pastTimeError: t("pastTimeError"),
                    minimumNoticeError: t.raw("minimumNoticeError"),
                    upcomingAppointmentError: t.raw("upcomingAppointmentError"),
                    unavailableTimeError: t("unavailableTimeError"),
                    sessionExpiredError: t("sessionExpiredError"),
                    emailUnverifiedError: t("emailUnverifiedError"),
                    rateLimitError: t("rateLimitError"),
                    pageUnavailableError: t("pageUnavailableError"),
                    authError: t("authError"),
                    socialError: t("socialError"),
                    intentError: t("intentError"),
                    consentError: t("consentError"),
                  } satisfies BookingRequestCopy
                }
                locale={locale}
                slug={slug}
                slots={slots.map((slot) => ({
                  startsAt: slot.startsAt.toISOString(),
                }))}
                timeZone={provider.timeZone}
              />
            ) : (
              <div className="mt-7 rounded-2xl border-2 border-dashed border-lumen-stone p-8 text-center text-sm text-[#686860]">
                {t("noTimes")}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[24px_1fr] gap-2">
      <span className="text-ember-glow" aria-hidden="true">
        {icon}
      </span>
      <div>
        <dt className="text-[10px] font-bold tracking-[0.08em] text-[#bfc8c2] uppercase">
          {label}
        </dt>
        <dd className="mt-1 font-semibold">{value}</dd>
      </div>
    </div>
  );
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
