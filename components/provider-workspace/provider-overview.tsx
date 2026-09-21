"use client";

import {
  ArrowUpRight,
  Bell,
  CalendarCheck,
  Check,
  Clock3,
  Copy,
  Eye,
  EyeOff,
  Link2,
  LoaderCircle,
} from "lucide-react";
import { useLocale } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { Link } from "@/i18n/navigation";
import type { ProviderDashboardData } from "@/lib/provider-workspace-types";

import { useProviderWorkspace } from "./provider-shell";

export type ProviderOverviewCopy = {
  eyebrow: string;
  greeting: string;
  intro: string;
  live: string;
  unpublished: string;
  publicLink: string;
  copy: string;
  copied: string;
  openPage: string;
  publish: string;
  unpublish: string;
  upcoming: string;
  viewAll: string;
  noAppointments: string;
  openThisWeek: string;
  openTimesDescription: string;
  manageAvailability: string;
  recentBookings: string;
  noNotifications: string;
  bookedBy: string;
  pendingBy: string;
  declinedBy: string;
  cancelledBy: string;
  loading: string;
  loadError: string;
};

export function ProviderOverview({ copy }: { copy: ProviderOverviewCopy }) {
  const locale = useLocale() as "en" | "tr";
  const { accessToken, data: setup, refresh } = useProviderWorkspace();
  const [dashboard, setDashboard] = useState<ProviderDashboardData | null>(
    null,
  );
  const [loadError, setLoadError] = useState("");
  const [copied, setCopied] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const bookingPath = `/${locale}/book/${setup.bookingPage.slug}`;

  const fetchDashboard = useCallback(async () => {
    const response = await fetch("/api/provider/dashboard", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Unable to load provider dashboard");

    return (await response.json()) as ProviderDashboardData;
  }, [accessToken]);

  useEffect(() => {
    let active = true;

    void fetchDashboard().then(
      (nextDashboard) => {
        if (!active) return;
        setDashboard(nextDashboard);
        setLoadError("");
      },
      () => {
        if (active) setLoadError(copy.loadError);
      },
    );

    return () => {
      active = false;
    };
  }, [copy.loadError, fetchDashboard]);

  async function copyLink() {
    await navigator.clipboard.writeText(
      `${window.location.origin}${bookingPath}`,
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function togglePublication() {
    setPublishing(true);
    try {
      const response = await fetch("/api/booking-page", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          isPublished: !setup.bookingPage.isPublished,
        }),
      });
      if (response.ok) {
        const [, nextDashboard] = await Promise.all([
          refresh(),
          fetchDashboard(),
        ]);
        setDashboard(nextDashboard);
        setLoadError("");
      }
    } finally {
      setPublishing(false);
    }
  }

  if (!dashboard) {
    return (
      <div
        aria-busy={!loadError}
        className="grid min-h-72 place-items-center rounded-[28px] border border-black/10 bg-[#fbfaf4] p-8 text-center"
      >
        <div>
          <LoaderCircle
            className={loadError ? "mx-auto" : "mx-auto animate-spin"}
            size={24}
          />
          <p className="mt-4 text-sm font-semibold text-black/55">
            {loadError || copy.loading}
          </p>
        </div>
      </div>
    );
  }

  const data = dashboard;

  return (
    <div>
      <section className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[11px] font-bold tracking-[0.16em] text-black/45 uppercase">
            {copy.eyebrow}
          </p>
          <h1 className="mt-3 max-w-3xl font-display text-5xl leading-[0.92] tracking-[-0.04em] sm:text-6xl">
            {copy.greeting.replace("{name}", data.profile.displayName)}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-black/55 sm:text-base">
            {copy.intro}
          </p>
        </div>
        <span
          className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-2 text-xs font-bold ${
            data.bookingPage.isPublished
              ? "bg-lavender-whisper text-vast-ink"
              : "bg-black/8 text-black/55"
          }`}
        >
          <span
            className={`size-2 rounded-full ${data.bookingPage.isPublished ? "bg-forest-ink" : "bg-black/30"}`}
          />
          {data.bookingPage.isPublished ? copy.live : copy.unpublished}
        </span>
      </section>

      <section className="mt-9 grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <article className="rounded-[28px] bg-vast-ink p-6 text-white sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold tracking-[0.14em] text-white/45 uppercase">
                {copy.publicLink}
              </p>
              <p className="mt-3 break-all font-mono text-sm text-lavender-whisper sm:text-base">
                {bookingPath}
              </p>
            </div>
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10">
              <Link2 size={18} />
            </span>
          </div>
          <div className="mt-8 flex flex-wrap gap-2">
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-lavender-whisper px-5 text-sm font-bold text-vast-ink transition hover:-translate-y-0.5"
              onClick={copyLink}
              type="button"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? copy.copied : copy.copy}
            </button>
            <a
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/20 px-5 text-sm font-semibold hover:bg-white/10"
              href={bookingPath}
              rel="noreferrer"
              target="_blank"
            >
              {copy.openPage} <ArrowUpRight size={16} />
            </a>
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/20 px-5 text-sm font-semibold hover:bg-white/10 disabled:opacity-50"
              disabled={publishing}
              onClick={togglePublication}
              type="button"
            >
              {data.bookingPage.isPublished ? (
                <EyeOff size={16} />
              ) : (
                <Eye size={16} />
              )}
              {data.bookingPage.isPublished ? copy.unpublish : copy.publish}
            </button>
          </div>
        </article>

        <article className="rounded-[28px] border border-black/10 bg-lavender-whisper p-6 sm:p-8">
          <Clock3 size={22} />
          <p className="mt-8 text-5xl font-semibold tracking-[-0.05em]">
            {data.openTimesThisWeek.length}
          </p>
          <h2 className="mt-2 text-sm font-bold">{copy.openThisWeek}</h2>
          <p className="mt-2 text-xs leading-5 text-black/55">
            {copy.openTimesDescription}
          </p>
          <Link
            className="mt-6 inline-flex items-center gap-2 text-xs font-bold"
            href="/provider/calendar"
          >
            {copy.manageAvailability} <ArrowUpRight size={14} />
          </Link>
        </article>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-2">
        <WorkspaceListCard
          action={{ href: "/provider/calendar", label: copy.viewAll }}
          empty={copy.noAppointments}
          icon={<CalendarCheck size={18} />}
          title={copy.upcoming}
        >
          {data.upcomingAppointments.slice(0, 4).map((appointment) => (
            <div
              className="flex items-center gap-4 border-t border-black/8 py-4 first:border-0 first:pt-1"
              key={appointment.id}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#e8e4ff] text-sm font-bold">
                {initials(appointment.studentName)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">
                  {appointment.studentName}
                </p>
                <p className="mt-1 text-xs text-black/45">
                  {formatDateTime(
                    appointment.startsAt,
                    locale,
                    data.bookingPage.timeZone,
                  )}
                </p>
              </div>
              <ArrowUpRight className="text-black/25" size={16} />
            </div>
          ))}
        </WorkspaceListCard>

        <WorkspaceListCard
          empty={copy.noNotifications}
          icon={<Bell size={18} />}
          title={copy.recentBookings}
        >
          {data.recentBookings.slice(0, 4).map((booking) => (
            <div
              className="flex items-start gap-3 border-t border-black/8 py-4 first:border-0 first:pt-1"
              key={booking.id}
            >
              <span
                className={`mt-1 size-2 shrink-0 rounded-full ${booking.status === "scheduled" ? "bg-forest-ink" : booking.status === "pending" ? "bg-ember-glow" : "bg-black/20"}`}
              />
              <div>
                <p className="text-sm leading-5">
                  {activityMessage(copy, booking.status).replace(
                    "{name}",
                    booking.studentName,
                  )}
                </p>
                <p className="mt-1 text-xs text-black/40">
                  {formatDateTime(
                    booking.createdAt,
                    locale,
                    data.bookingPage.timeZone,
                  )}
                </p>
              </div>
            </div>
          ))}
        </WorkspaceListCard>
      </section>
    </div>
  );
}

function activityMessage(
  copy: ProviderOverviewCopy,
  status: "pending" | "scheduled" | "declined" | "cancelled",
) {
  if (status === "pending") return copy.pendingBy;
  if (status === "scheduled") return copy.bookedBy;
  if (status === "declined") return copy.declinedBy;
  return copy.cancelledBy;
}

function WorkspaceListCard({
  action,
  children,
  empty,
  icon,
  title,
}: {
  action?: { href: "/provider/calendar"; label: string };
  children: React.ReactNode;
  empty: string;
  icon: React.ReactNode;
  title: string;
}) {
  const hasChildren = Array.isArray(children)
    ? children.length > 0
    : !!children;
  return (
    <article className="min-h-72 rounded-[28px] border border-black/10 bg-[#fbfaf4] p-6 sm:p-7">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-full bg-black/5">
            {icon}
          </span>
          <h2 className="font-bold">{title}</h2>
        </div>
        {action ? (
          <Link className="text-xs font-bold text-black/45" href={action.href}>
            {action.label}
          </Link>
        ) : null}
      </div>
      {hasChildren ? children : <EmptyState>{empty}</EmptyState>}
    </article>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-40 place-items-center rounded-2xl border border-dashed border-black/15 px-6 text-center text-sm text-black/40">
      {children}
    </div>
  );
}

function formatDateTime(value: string, locale: string, timeZone: string) {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
