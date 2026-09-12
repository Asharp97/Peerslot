"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";
import { useProviderWorkspace } from "./provider-shell";

export type ProviderDirectoryCopy = {
  eyebrow: string;
  title: string;
  description: string;
  add: string;
  name: string;
  email: string;
  edit: string;
  remove: string;
  deleteConfirm: string;
  empty: string;
  save: string;
  saving: string;
  cancel: string;
  loading: string;
  loadError: string;
  saveError: string;
  emailConflict: string;
  nameConflict: string;
  calendar: string;
  durationLabel?: string;
  durationHelp?: string;
  durationSummary?: string;
  customDuration?: string;
};
type Entry = {
  id: string;
  name?: string;
  displayName?: string;
  email?: string | null;
  defaultDurationMinutes?: number | null;
};

export function ProviderDirectory({
  kind,
  copy,
}: {
  kind: "students" | "activities";
  copy: ProviderDirectoryCopy;
}) {
  const { accessToken } = useProviderWorkspace();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [duration, setDuration] = useState("");
  const isStudent = kind === "students";
  const endpoint = isStudent
    ? "/api/provider/students"
    : "/api/provider/personal-activities";
  const nameOf = (entry: Entry) => entry.displayName ?? entry.name ?? "";

  const load = useCallback(async () => {
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(copy.loadError);
    const body = await response.json();
    return body[kind] as Entry[];
  }, [accessToken, copy.loadError, endpoint, kind]);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      try {
        const entries = await load();
        if (!cancelled) setEntries(entries);
      } catch {
        if (!cancelled) setError(copy.loadError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void initialize();
    return () => {
      cancelled = true;
    };
  }, [copy.loadError, load]);

  async function checkResponse(response: Response) {
    if (response.ok) return;
    const body = await response.json().catch(() => null);
    if (body?.code === "student_email_conflict" && body.studentName)
      throw new Error(copy.emailConflict.replace("{name}", body.studentName));
    if (body?.code === "activity_name_conflict")
      throw new Error(copy.nameConflict);
    throw new Error(copy.saveError);
  }

  function reset() {
    setEditing(null);
    setName("");
    setEmail("");
    setDuration("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        editing ? `${endpoint}/${editing}` : endpoint,
        {
          method: editing ? "PATCH" : "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            isStudent
              ? {
                  displayName: name,
                  email: email || (editing ? "" : undefined),
                }
              : {
                  name,
                  defaultDurationMinutes:
                    duration === "" ? null : Number(duration),
                },
          ),
        },
      );
      await checkResponse(response);
      setEntries(await load());
      reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.saveError);
    } finally {
      setSaving(false);
    }
  }

  async function remove(entry: Entry) {
    if (!window.confirm(copy.deleteConfirm.replace("{name}", nameOf(entry))))
      return;
    setSaving(true);
    setError("");
    try {
      await checkResponse(
        await fetch(`${endpoint}/${entry.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      );
      setEntries(await load());
      if (editing === entry.id) reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.saveError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <header className="mb-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-black/45">
          {copy.eyebrow}
        </p>
        <h1 className="mt-2 font-display text-4xl tracking-[-0.04em] sm:text-5xl">
          {copy.title}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-black/55">
          {copy.description}
        </p>
        {!isStudent ? (
          <Link
            className="mt-3 inline-flex text-sm font-semibold underline underline-offset-4"
            href="/provider/appointments"
          >
            {copy.calendar}
          </Link>
        ) : null}
      </header>
      {error ? (
        <p
          role="alert"
          className="mb-5 rounded-xl bg-ember-glow px-4 py-3 text-sm font-semibold"
        >
          {error}
        </p>
      ) : null}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <form
          className="rounded-3xl border border-black/10 bg-[#fbfaf4] p-6"
          onSubmit={save}
        >
          <h2 className="mb-5 text-lg font-bold">
            {editing ? copy.edit : copy.add}
          </h2>
          <Label htmlFor="directory-name">{copy.name}</Label>
          <Input
            id="directory-name"
            className="mt-2 mb-4 min-h-11 rounded-xl bg-white"
            value={name}
            onChange={(event) => setName(event.target.value)}
            minLength={isStudent ? 2 : 1}
            maxLength={100}
            required
            disabled={saving}
          />
          {isStudent ? (
            <>
              <Label htmlFor="directory-email">{copy.email}</Label>
              <Input
                id="directory-email"
                className="mt-2 mb-4 min-h-11 rounded-xl bg-white"
                type="email"
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={saving}
              />
            </>
          ) : null}
          {!isStudent ? (
            <>
              <Label htmlFor="directory-duration">{copy.durationLabel}</Label>
              <Input
                id="directory-duration"
                type="number"
                min={1}
                max={1440}
                step={1}
                className="mt-2 min-h-11 rounded-xl bg-white"
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                disabled={saving}
                aria-describedby="directory-duration-help"
              />
              <p
                id="directory-duration-help"
                className="mt-2 text-xs leading-5 text-black/50"
              >
                {copy.durationHelp}
              </p>
            </>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              type="submit"
              disabled={saving || loading}
              className="rounded-full"
            >
              {saving ? (
                <LoaderCircle className="animate-spin" size={16} />
              ) : (
                <Plus size={16} />
              )}
              {saving ? copy.saving : editing ? copy.save : copy.add}
            </Button>
            {editing ? (
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => {
                  reset();
                  setError("");
                }}
                className="rounded-full"
              >
                {copy.cancel}
              </Button>
            ) : null}
          </div>
        </form>
        <section
          aria-label={copy.title}
          aria-busy={loading}
          className="space-y-3"
        >
          {loading ? (
            <p role="status" className="p-6 text-sm text-black/55">
              {copy.loading}
            </p>
          ) : entries.length ? (
            entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-3 rounded-2xl border border-black/10 bg-white p-4"
              >
                <span
                  className={`grid size-10 shrink-0 place-items-center rounded-full font-bold ${isStudent ? "bg-lavender-whisper" : "bg-[#fde7b0] text-[#78470c]"}`}
                >
                  {nameOf(entry).slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{nameOf(entry)}</p>
                  {isStudent ? (
                    <p className="truncate text-xs text-black/50">
                      {entry.email ?? "—"}
                    </p>
                  ) : (
                    <p className="text-xs text-black/50">
                      {entry.defaultDurationMinutes
                        ? copy.durationSummary?.replace(
                            "{minutes}",
                            String(entry.defaultDurationMinutes),
                          )
                        : copy.customDuration}
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={saving}
                  aria-label={`${copy.edit}: ${nameOf(entry)}`}
                  onClick={() => {
                    setEditing(entry.id);
                    setName(nameOf(entry));
                    setEmail(entry.email ?? "");
                    setDuration(
                      entry.defaultDurationMinutes == null
                        ? ""
                        : String(entry.defaultDurationMinutes),
                    );
                    setError("");
                    document.getElementById("directory-name")?.focus();
                  }}
                >
                  <Pencil size={15} />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={saving}
                  aria-label={`${copy.remove}: ${nameOf(entry)}`}
                  onClick={() => void remove(entry)}
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            ))
          ) : (
            <p className="rounded-2xl border border-dashed border-black/15 p-8 text-center text-sm text-black/50">
              {copy.empty}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
