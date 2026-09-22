"use client";

import { ArrowLeft, Link2Off } from "lucide-react";

export function NotFoundPage({
  copy,
  homeHref = "/",
}: {
  copy: {
    eyebrow: string;
    title: string;
    body: string;
    home: string;
    back: string;
  };
  homeHref?: string;
}) {
  return (
    <main
      id="main-content"
      className="mx-auto flex w-full max-w-5xl flex-1 items-center px-5 py-20 sm:px-8 sm:py-28">
      <section className="w-full rounded-[32px] border-2 border-vast-ink bg-lavender-whisper p-7 sm:p-12">
        <span className="grid size-14 place-items-center rounded-2xl bg-vast-ink text-lavender-whisper">
          <Link2Off aria-hidden size={24} />
        </span>
        <p className="mt-8 text-[11px] font-bold tracking-[0.18em] text-black/50 uppercase">
          {copy.eyebrow}
        </p>
        <h1 className="mt-3 max-w-2xl font-display text-5xl leading-[0.95] tracking-[-0.04em] sm:text-7xl">
          {copy.title}
        </h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-black/65 sm:text-lg">
          {copy.body}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            className="inline-flex min-h-12 items-center gap-2 rounded-full bg-vast-ink px-5 text-sm font-bold text-white hover:bg-vast-ink/90"
            href={homeHref}>
            {copy.home}
            <ArrowLeft aria-hidden size={16} />
          </a>
          <button
            className="inline-flex min-h-12 items-center rounded-full border border-vast-ink/20 bg-white/60 px-5 text-sm font-bold hover:bg-white"
            onClick={() => window.history.back()}
            type="button">
            {copy.back}
          </button>
        </div>
      </section>
    </main>
  );
}
