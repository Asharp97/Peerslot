"use client";

import { Separator, Tooltip } from "radix-ui";
import {
  Check,
  Eye,
  EyeOff,
  Link2,
  LoaderCircle,
  RefreshCw,
  Info,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  appointmentDurationOptions,
  restTimeOptions,
} from "@/lib/scheduling-options";

import { TimeZoneCombobox } from "./time-zone-combobox";
import { useProviderWorkspace } from "./provider-shell";

export type ProviderSettingsCopy = {
  eyebrow: string;
  title: string;
  intro: string;
  bookingPage: string;
  pageTitle: string;
  duration: string;
  rest: string;
  restHelp: string;
  notice: string;
  noticeHelp: string;
  weeklyRescheduleLimit: string;
  weeklyRescheduleHelp: string;
  perWeek: string;
  timeZone: string;
  timeZoneSearch: string;
  timeZoneEmpty: string;
  published: string;
  publishHelp: string;
  save: string;
  saved: string;
  saveError: string;
  linkSecurity: string;
  linkDescription: string;
  regenerate: string;
  minutes: string;
  hours: string;
};

export function ProviderSettings({
  copy,
  locale,
}: {
  copy: ProviderSettingsCopy;
  locale: string;
}) {
  const { accessToken, data, refresh } = useProviderWorkspace();
  const [title, setTitle] = useState(data.bookingPage.title);
  const [duration, setDuration] = useState(
    data.bookingPage.appointmentDurationMinutes,
  );
  const [notice, setNotice] = useState(data.bookingPage.minimumNoticeHours);
  const [weeklyRescheduleLimit, setWeeklyRescheduleLimit] = useState(
    data.bookingPage.weeklyRescheduleLimit ?? 1,
  );
  const [rest, setRest] = useState(data.profile.restBetweenSessionsMinutes);
  const [timeZone, setTimeZone] = useState(data.bookingPage.timeZone);
  const [published, setPublished] = useState(data.bookingPage.isPublished);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [rotating, setRotating] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("saving");
    try {
      const response = await fetch("/api/booking-page", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          timeZone,
          appointmentDurationMinutes: duration,
          restBetweenSessionsMinutes: rest,
          minimumNoticeHours: notice,
          weeklyRescheduleLimit,
          isPublished: published,
        }),
      });

      if (!response.ok) {
        setState("error");
        return;
      }

      await refresh();
      setState("saved");
      window.setTimeout(() => setState("idle"), 1800);
    } catch {
      setState("error");
    }
  }

  async function regenerateLink() {
    setRotating(true);
    try {
      const response = await fetch("/api/booking-page/regenerate-link", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.ok) await refresh();
    } finally {
      setRotating(false);
    }
  }

  return (
    <div>
      <section>
        <p className="text-[11px] font-bold tracking-[0.16em] text-black/45 uppercase">
          {copy.eyebrow}
        </p>
        <h1 className="mt-3 font-display text-5xl leading-none tracking-[-0.04em] sm:text-6xl">
          {copy.title}
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-black/55 sm:text-base">
          {copy.intro}
        </p>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <form
          className="rounded-[28px] border border-black/10 bg-[#fbfaf4] p-6 sm:p-8"
          onSubmit={save}>
          <h2 className="text-lg font-bold">{copy.bookingPage}</h2>
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <SettingsInput
              label={copy.pageTitle}
              onChange={setTitle}
              value={title}
            />
            <div>
              <Label className="text-xs font-bold text-black/55">
                {copy.timeZone}
              </Label>
              <TimeZoneCombobox
                emptyLabel={copy.timeZoneEmpty}
                label={copy.timeZone}
                locale={locale}
                onChange={setTimeZone}
                searchLabel={copy.timeZoneSearch}
                value={timeZone}
              />
            </div>
            <NumberSelect
              label={copy.duration}
              onChange={setDuration}
              options={appointmentDurationOptions}
              suffix={copy.minutes}
              value={duration}
            />
            <NumberSelect
              label={copy.rest}
              onChange={setRest}
              options={restTimeOptions}
              suffix={copy.minutes}
              value={rest}
              hint={copy.restHelp}
            />
            <NumberSelect
              label={copy.notice}
              onChange={setNotice}
              options={[0, 1, 4, 12, 24, 48]}
              suffix={copy.hours}
              value={notice}
              hint={copy.noticeHelp}
            />
            <NumberSelect
              label={copy.weeklyRescheduleLimit}
              onChange={setWeeklyRescheduleLimit}
              options={Array.from({ length: 5 }, (_, index) => index)}
              suffix={copy.perWeek}
              value={weeklyRescheduleLimit}
              hint={copy.weeklyRescheduleHelp}
            />
          </div>

          <Separator.Root decorative className="mt-6 h-px w-full bg-black/10" />
          <div className="mt-6 flex items-center gap-4 rounded-2xl border border-black/10 bg-white p-4">
            <span
              className={`grid size-10 place-items-center rounded-full ${published ? "bg-lavender-whisper" : "bg-black/5 text-black/35"}`}>
              {published ? <Eye size={18} /> : <EyeOff size={18} />}
            </span>
            <span className="flex-1">
              <span className="block text-sm font-bold">{copy.published}</span>
              <span className="mt-1 block text-xs text-black/45">
                {copy.publishHelp}
              </span>
            </span>
            <Switch
              aria-label={copy.published}
              checked={published}
              className="data-checked:bg-vast-ink"
              onCheckedChange={setPublished}
            />
          </div>

          {state === "error" ? (
            <p className="mt-4 text-xs font-semibold text-red-700">
              {copy.saveError}
            </p>
          ) : null}
          <Button
            className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-full bg-vast-ink px-6 text-sm font-bold text-white disabled:opacity-50"
            disabled={state === "saving"}
            type="submit">
            {state === "saving" ? (
              <LoaderCircle className="animate-spin" size={16} />
            ) : (
              <Check className="text-lavender-whisper" size={16} />
            )}
            {state === "saved" ? copy.saved : copy.save}
          </Button>
        </form>

        <article className="h-fit rounded-[28px] bg-vast-ink p-6 text-white sm:p-8">
          <span className="grid size-11 place-items-center rounded-full bg-lavender-whisper text-vast-ink">
            <Link2 size={19} />
          </span>
          <h2 className="mt-8 font-display text-3xl">{copy.linkSecurity}</h2>
          <p className="mt-3 text-sm leading-6 text-white/55">
            {copy.linkDescription}
          </p>
          <p className="mt-6 rounded-xl bg-white/8 px-4 py-3 font-mono text-sm text-lavender-whisper">
            {data.bookingPage.slug}
          </p>
          <Button
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/20 bg-transparent px-5 text-sm font-bold text-white hover:bg-white/10 hover:text-white disabled:opacity-50"
            disabled={rotating}
            onClick={regenerateLink}
            type="button"
            variant="outline">
            <RefreshCw className={rotating ? "animate-spin" : ""} size={15} />
            {copy.regenerate}
          </Button>
        </article>
      </section>

    </div>
  );
}

function SettingsInput({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div>
      <Label className="text-xs font-bold text-black/55">{label}</Label>
      <Input
        className="mt-2 min-h-12 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-vast-ink"
        onChange={(event) => onChange(event.target.value)}
        required
        value={value}
      />
    </div>
  );
}

function NumberSelect({
  label,
  onChange,
  options,
  suffix,
  value,
  hint,
}: {
  label: string;
  onChange: (value: number) => void;
  options: readonly number[];
  suffix: string;
  value: number;
  hint?: string;
}) {
  return (
    <div>
      <span className="flex items-center justify-between pr-2">
        <Label className="text-xs font-bold text-black/55">{label}</Label>
        {hint && (
          <Tooltip.Provider>
            <Tooltip.Root delayDuration={0}>
              <Tooltip.Trigger aria-label={label} type="button">
                <Info className="ml-1" size={12} />
              </Tooltip.Trigger>
              <Tooltip.Content sideOffset={5} className="max-w-50 z-50">
                <p className="mt-1 text-xs text-white/95  bg-black rounded-xl p-2">
                  {hint}
                </p>
              </Tooltip.Content>
            </Tooltip.Root>
          </Tooltip.Provider>
        )}
      </span>
      <Select
        onValueChange={(nextValue) => onChange(Number(nextValue))}
        value={String(value)}>
        <SelectTrigger
          aria-label={label}
          className="mt-2 min-h-12 w-full rounded-xl border-black/10 bg-white px-4 text-vast-ink focus-visible:border-black/10 focus-visible:ring-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-48 overflow-y-auto">
          {options.map((option) => (
            <SelectItem key={option} value={String(option)}>
              {option} {suffix}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
