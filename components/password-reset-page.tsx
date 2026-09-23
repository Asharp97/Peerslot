"use client";

import { FormEvent, useState } from "react";
import { LoaderCircle, LockKeyhole } from "lucide-react";
import { Link } from "@/i18n/navigation";

type Copy = {
  title: string;
  body: string;
  password: string;
  confirmPassword: string;
  action: string;
  saving: string;
  success: string;
  back: string;
  invalid: string;
  mismatch: string;
  error: string;
};

export function PasswordResetPage({
  copy,
  token,
  invalidToken,
}: {
  copy: Copy;
  locale: string;
  token: string;
  invalidToken: boolean;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">(
    invalidToken ? "error" : "idle",
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmation) {
      setStatus("error");
      return;
    }
    setStatus("saving");
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: password, token }),
    }).catch(() => null);
    setStatus(response?.ok ? "success" : "error");
  }

  const message =
    status === "success"
      ? copy.success
      : status === "error"
        ? invalidToken
          ? copy.invalid
          : password !== confirmation
            ? copy.mismatch
            : copy.error
        : copy.body;

  return (
    <main className="grid min-h-screen place-items-center bg-lumen-cream px-4 py-10 text-vast-ink">
      <section className="w-full max-w-lg rounded-[28px] border-2 border-vast-ink bg-white p-7 shadow-[8px_8px_0_var(--color-vast-ink)] sm:p-12">
        <span className="grid size-12 place-items-center rounded-2xl bg-lavender-whisper">
          <LockKeyhole size={21} aria-hidden="true" />
        </span>
        <h1 className="mt-6 font-display text-4xl tracking-[-0.03em]">
          {copy.title}
        </h1>
        <p className="mt-3 text-sm leading-6 text-black/60">{message}</p>

        {status !== "success" && !invalidToken ? (
          <form className="mt-7 space-y-4" onSubmit={submit}>
            <label className="block text-sm font-semibold">
              {copy.password}
              <input
                className="mt-2 min-h-12 w-full rounded-xl border-2 border-vast-ink px-3.5 outline-none focus:ring-2 focus:ring-vast-ink"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label className="block text-sm font-semibold">
              {copy.confirmPassword}
              <input
                className="mt-2 min-h-12 w-full rounded-xl border-2 border-vast-ink px-3.5 outline-none focus:ring-2 focus:ring-vast-ink"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
            <button
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-vast-ink px-5 text-sm font-semibold text-white disabled:opacity-60"
              disabled={status === "saving"}
              type="submit"
            >
              {status === "saving" ? <LoaderCircle className="animate-spin" size={18} /> : null}
              {status === "saving" ? copy.saving : copy.action}
            </button>
          </form>
        ) : null}

        <Link className="mt-7 inline-flex text-sm font-semibold underline underline-offset-3" href="/auth/provider">
          {copy.back}
        </Link>
      </section>
    </main>
  );
}
