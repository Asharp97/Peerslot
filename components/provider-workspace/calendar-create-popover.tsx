"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Clock3, Coffee, LoaderCircle, Plus, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { formatInTimeZone } from "@/lib/availability-window";
import { zonedLocalDateTimeToUtc } from "@/lib/provider-availability";
import type { PersonalActivityName } from "@/lib/personal-activity";

export type CalendarCreatePopoverCopy = {
  quickTitle: string;
  quickSearchStudent: string;
  quickSearchActivity: string;
  quickCreate: string;
  quickEmpty: string;
  quickHint: string;
  quickOptions: string;
  quickDuration: string;
  quickMinutes: string;
  quickClose: string;
  quickRetry: string;
  quickLoadError: string;
  quickNameError: string;
  quickTimeError: string;
  quickLoading: string;
  quickOneTime: string;
  studentSession: string;
  personalActivity: string;
  addType: string;
  startsAt: string;
  repetition: string;
  oneTime: string;
  everyWeek: string;
  saving: string;
  saveError: string;
  pastSessionError: string;
};

type Student = { id: string; displayName: string; email: string | null };
type Mode = "session" | "personal";
type Choice = {
  id: string;
  name: string;
  email?: string | null;
  defaultDurationMinutes?: number | null;
};
export type CalendarCreateAnchor = { startsAt: Date; x: number; y: number };

export function CalendarCreatePopover({
  anchor,
  allowSessions = true,
  accessToken,
  timeZone,
  locale,
  sessionDuration,
  copy,
  onClose,
  onSaved,
  onSavingChange,
  onStudentCreated,
  readError,
}: {
  allowSessions?: boolean;
  anchor: CalendarCreateAnchor;
  accessToken: string;
  timeZone: string;
  locale: string;
  sessionDuration: number;
  copy: CalendarCreatePopoverCopy;
  onClose: () => void;
  onSaved: () => void;
  onSavingChange: (saving: boolean) => void;
  onStudentCreated: (student: Student) => void;
  readError: (response: Response) => Promise<string>;
}) {
  const [mode, setMode] = useState<Mode>(allowSessions ? "session" : "personal");
  const [students, setStudents] = useState<Student[]>([]);
  const [activities, setActivities] = useState<PersonalActivityName[]>([]);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState("");
  const [durationOverride, setDurationOverride] = useState<string | null>(null);
  const [recurrence, setRecurrence] = useState<"none" | "weekly">("none");
  const local = formatInTimeZone(anchor.startsAt, timeZone);
  const [startTime, setStartTime] = useState(local.slice(11, 16));
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const savingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const hintId = useId();
  const virtualRef = useMemo(
    () => ({
      current: {
        getBoundingClientRect: () => new DOMRect(anchor.x, anchor.y, 0, 0),
      },
    }),
    [anchor.x, anchor.y],
  );

  useEffect(() => {
    const controller = new AbortController();
    async function loadNames() {
      setLoading(true);
      setLoadFailed(false);
      try {
        const responses = await Promise.all(
          [allowSessions ? "/api/provider/students" : null, "/api/provider/personal-activities"].map(
            (url) =>
              url === null ? Promise.resolve(Response.json({ students: [] })) : fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
                cache: "no-store",
                signal: controller.signal,
              }),
          ),
        );
        if (responses.some((response) => !response.ok)) throw new Error();
        const [studentBody, activityBody] = await Promise.all(
          responses.map((response) => response.json()),
        );
        if (controller.signal.aborted) return;
        setStudents(studentBody.students);
        setActivities(activityBody.activities);
      } catch {
        if (!controller.signal.aborted) setLoadFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadNames();
    return () => controller.abort();
  }, [accessToken, reload, allowSessions]);

  const normalize = (value: string) => value.trim().toLocaleLowerCase(locale);
  const choices: Choice[] =
    mode === "session"
      ? students.map((student) => ({
          id: student.id,
          name: student.displayName,
          email: student.email,
        }))
      : activities;
  const search = normalize(query);
  const matches = choices.filter(
    (choice) =>
      normalize(choice.name).includes(search) ||
      choice.email?.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const exact = choices.some(
    (choice) =>
      normalize(choice.name) === search ||
      choice.email?.toLowerCase() === query.trim().toLowerCase(),
  );
  const minimumNameLength = mode === "session" ? 2 : 1;
  const canCreate =
    query.trim().length >= minimumNameLength &&
    query.trim().length <= 100 &&
    !exact;
  const activeChoice = choices.find((choice) => choice.id === highlighted);
  const defaultDuration = (choice?: Choice) =>
    mode === "session"
      ? sessionDuration
      : (choice?.defaultDurationMinutes ?? 60);
  const duration = durationOverride ?? String(defaultDuration(activeChoice));
  const unavailable = loading || loadFailed || saving;

  function switchMode(next: Mode) {
    if (savingRef.current) return;
    setMode(next);
    setQuery("");
    setHighlighted("");
    setDurationOverride(null);
    setError("");
    inputRef.current?.focus();
  }

  async function choose(choice?: Choice) {
    if (savingRef.current || loading || loadFailed) return;
    const name = query.trim();
    if (!choice && (name.length < minimumNameLength || name.length > 100)) {
      setError(
        copy.quickNameError.replace("{minimum}", String(minimumNameLength)),
      );
      return;
    }
    const minutes =
      durationOverride === null
        ? defaultDuration(choice)
        : Number(durationOverride);
    if (
      !Number.isInteger(minutes) ||
      minutes < 1 ||
      minutes > 1440 ||
      !/^\d{2}:\d{2}$/.test(startTime)
    ) {
      setError(copy.quickTimeError);
      return;
    }
    let startsAt: Date;
    try {
      // Retain the exact clicked instant during a repeated DST hour.
      startsAt =
        startTime === local.slice(11, 16)
          ? anchor.startsAt
          : zonedLocalDateTimeToUtc(local.slice(0, 10), startTime, timeZone);
    } catch {
      setError(copy.quickTimeError);
      return;
    }
    if (mode === "session" && startsAt <= new Date()) {
      setError(copy.pastSessionError);
      return;
    }
    const endsAt = new Date(startsAt.getTime() + minutes * 60_000);
    savingRef.current = true;
    setSaving(true);
    onSavingChange(true);
    setError("");
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };
    async function post(url: string, body: unknown) {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(await readError(response));
      return response;
    }
    try {
      let id = choice?.id;
      if (!id && mode === "session") {
        const response = await post("/api/provider/students", {
          displayName: name,
        });
        const { student } = (await response.json()) as { student: Student };
        id = student.id;
        // Keep a successful creation available for retry if scheduling fails.
        setStudents((current) => [...current, student]);
        onStudentCreated(student);
        setHighlighted(id);
      } else if (!id) {
        const response = await post("/api/provider/personal-activities", {
          name,
          defaultDurationMinutes: durationOverride === null ? null : minutes,
        });
        const { activity } = (await response.json()) as {
          activity: PersonalActivityName;
        };
        id = activity.id;
        setActivities((current) => [...current, activity]);
        setHighlighted(id);
      }
      await post(
        mode === "session"
          ? "/api/provider/appointments"
          : "/api/provider/personal-activities/schedules",
        {
          ...(mode === "session"
            ? { providerStudentId: id, color: "#f0d7ff" }
            : { activityId: id }),
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          recurrence,
        },
      );
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.saveError);
    } finally {
      savingRef.current = false;
      setSaving(false);
      onSavingChange(false);
    }
  }

  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open && !savingRef.current) onClose();
      }}
    >
      <PopoverAnchor virtualRef={virtualRef} />
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={8}
        collisionPadding={12}
        aria-labelledby={titleId}
        aria-describedby={hintId}
        aria-busy={saving || loading}
        className="w-[22rem] max-w-[calc(100vw-24px)] max-h-[min(36rem,var(--radix-popover-content-available-height))] gap-3 overflow-y-auto rounded-2xl bg-[#fbfaf4] p-4 shadow-xl"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          if (savingRef.current) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (savingRef.current) event.preventDefault();
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-xl leading-tight">
              {copy.quickTitle}
            </h2>
            <p className="mt-1 text-xs text-black/60">
              {new Intl.DateTimeFormat(locale, {
                timeZone,
                weekday: "short",
                month: "short",
                day: "numeric",
              }).format(anchor.startsAt)}{" "}
              · {startTime}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 rounded-full"
            aria-label={copy.quickClose}
            disabled={saving}
            onClick={onClose}
          >
            <X size={16} />
          </Button>
        </div>
        <div
          role="group"
          aria-label={copy.addType}
          className={`grid ${allowSessions ? "grid-cols-2" : "grid-cols-1"} gap-1 rounded-xl bg-black/5 p-1`}
        >
          {(["session", "personal"] as const).filter((kind) => allowSessions || kind === "personal").map((kind) => (
            <button
              key={kind}
              type="button"
              disabled={saving}
              aria-pressed={mode === kind}
              onClick={() => switchMode(kind)}
              className={`flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-bold transition-colors disabled:opacity-50 ${mode === kind ? (kind === "session" ? "bg-[#f0d7ff] text-[#2f1f57]" : "bg-[#fde7b0] text-[#633c0c]") : "text-black/55 hover:bg-white/60"}`}
            >
              {kind === "session" ? (
                <UserRound size={15} />
              ) : (
                <Coffee size={15} />
              )}{" "}
              {kind === "session" ? copy.studentSession : copy.personalActivity}
            </button>
          ))}
        </div>
        <details className="rounded-xl border border-black/10 px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium">
            <Clock3 size={13} className="mr-1 inline" />
            {copy.quickOptions} ·{" "}
            {copy.quickMinutes.replace("{minutes}", duration)} ·{" "}
            {recurrence === "none" ? copy.quickOneTime : copy.everyWeek}
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="text-xs font-medium">
              {copy.startsAt}
              <Input
                className="mt-1 h-9"
                aria-label={copy.startsAt}
                type="time"
                value={startTime}
                disabled={saving}
                onChange={(event) => setStartTime(event.target.value)}
              />
            </label>
            <label className="text-xs font-medium">
              {copy.quickDuration}
              <Input
                className="mt-1 h-9"
                aria-label={copy.quickDuration}
                type="number"
                min={1}
                max={1440}
                step={1}
                value={duration}
                disabled={saving}
                onChange={(event) => setDurationOverride(event.target.value)}
              />
            </label>
            <label className="col-span-2 text-xs font-medium">
              {copy.repetition}
              <select
                className="mt-1 h-9 w-full rounded-lg border border-black/15 bg-transparent px-2"
                aria-label={copy.repetition}
                disabled={saving}
                value={recurrence}
                onChange={(event) =>
                  setRecurrence(event.target.value as "none" | "weekly")
                }
              >
                <option value="none">{copy.quickOneTime}</option>
                <option value="weekly">{copy.everyWeek}</option>
              </select>
            </label>
          </div>
        </details>
        <Command
          label={
            mode === "session"
              ? copy.quickSearchStudent
              : copy.quickSearchActivity
          }
          className="h-auto bg-transparent p-0"
          shouldFilter={false}
          value={highlighted}
          onValueChange={setHighlighted}
        >
          <CommandInput
            ref={inputRef}
            aria-label={
              mode === "session"
                ? copy.quickSearchStudent
                : copy.quickSearchActivity
            }
            placeholder={
              mode === "session"
                ? copy.quickSearchStudent
                : copy.quickSearchActivity
            }
            value={query}
            onValueChange={(value) => {
              setQuery(value);
              setError("");
            }}
            disabled={saving}
            maxLength={100}
            className="px-2"
          />
          <CommandList
            className="mt-2 max-h-44"
            label={
              mode === "session" ? copy.studentSession : copy.personalActivity
            }
          >
            {!loading &&
              !loadFailed &&
              matches.map((choice) => (
                <CommandItem
                  key={choice.id}
                  value={choice.id}
                  disabled={unavailable}
                  onSelect={() => void choose(choice)}
                  className="min-h-10 cursor-pointer rounded-lg px-2.5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {choice.name}
                    </span>
                    {choice.email ? (
                      <span className="block truncate text-xs text-black/50">
                        {choice.email}
                      </span>
                    ) : null}
                  </span>
                  {mode === "personal" && choice.defaultDurationMinutes ? (
                    <span className="shrink-0 text-xs text-black/50">
                      {copy.quickMinutes.replace(
                        "{minutes}",
                        String(choice.defaultDurationMinutes),
                      )}
                    </span>
                  ) : null}
                </CommandItem>
              ))}
            {!loading && !loadFailed && canCreate ? (
              <CommandItem
                value="__create__"
                disabled={saving}
                onSelect={() => void choose()}
                className="min-h-10 cursor-pointer rounded-lg border-t border-black/10 px-2.5 font-semibold"
              >
                <Plus size={16} />
                <span className="min-w-0 break-words">
                  {copy.quickCreate.replace("{name}", query.trim())}
                </span>
              </CommandItem>
            ) : null}
            {!loading && !loadFailed && !matches.length && !canCreate ? (
              <p className="px-2 py-3 text-xs text-black/55">
                {query.trim()
                  ? copy.quickNameError.replace(
                      "{minimum}",
                      String(minimumNameLength),
                    )
                  : copy.quickEmpty}
              </p>
            ) : null}
          </CommandList>
        </Command>
        {loading || saving ? (
          <p role="status" className="flex items-center gap-2 text-xs">
            <LoaderCircle size={14} className="animate-spin" />
            {saving ? copy.saving : copy.quickLoading}
          </p>
        ) : null}
        {loadFailed ? (
          <div role="alert" className="text-xs">
            <p>{copy.quickLoadError}</p>
            <Button
              type="button"
              variant="outline"
              className="mt-2"
              onClick={() => setReload((current) => current + 1)}
            >
              {copy.quickRetry}
            </Button>
          </div>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="rounded-lg bg-ember-glow px-3 py-2 text-xs font-medium"
          >
            {error}
          </p>
        ) : null}
        <p id={hintId} className="text-[11px] leading-4 text-black/50">
          {copy.quickHint}
        </p>
      </PopoverContent>
    </Popover>
  );
}
