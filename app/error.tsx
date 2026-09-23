"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("application_render_error");
  }, []);

  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f3eb] px-6 text-vast-ink">
      <section className="max-w-md rounded-[28px] border border-black/10 bg-white p-8 text-center shadow-sm">
        <p className="text-[11px] font-bold tracking-[0.16em] text-black/45 uppercase">
          PeerSlot
        </p>
        <h1 className="mt-3 font-display text-4xl tracking-[-0.04em]">
          Something went wrong
        </h1>
        <p className="mt-3 text-sm leading-6 text-black/60">
          We couldn&apos;t load this page. Try again, or return to PeerSlot and
          continue from your workspace.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <button
            className="min-h-11 rounded-full bg-vast-ink px-5 text-sm font-bold text-white"
            onClick={() => reset()}
            type="button"
          >
            Try again
          </button>
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-vast-ink px-5 text-sm font-bold"
            href="/"
          >
            Go to PeerSlot
          </Link>
        </div>
      </section>
    </main>
  );
}
