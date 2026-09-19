import { CalendarDays } from "lucide-react";
import type { AppointmentView } from "@/lib/appointment-agenda";
import type { AppointmentsCopy } from "./copy";

export function AppointmentsSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-4">
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((key) => (
        <div
          key={key}
          aria-hidden="true"
          className="space-y-5 rounded-[24px] border border-black/10 bg-white p-5 motion-safe:animate-pulse sm:p-6"
        >
          <div className="h-3 w-24 rounded bg-black/10" />
          <div className="flex items-center gap-3">
            <div className="size-11 rounded-full bg-lavender-whisper/60" />
            <div className="h-4 w-36 max-w-full rounded bg-black/10" />
          </div>
          <div className="h-9 w-32 rounded-full bg-black/5" />
        </div>
      ))}
    </div>
  );
}

export function AppointmentsEmptyState({
  view,
  copy,
}: {
  view: AppointmentView;
  copy: AppointmentsCopy;
}) {
  return (
    <div className="grid min-h-64 place-items-center rounded-[28px] border-2 border-dashed border-black/10 bg-[#fbfaf4] p-6 text-center">
      <div>
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-lavender-whisper">
          <CalendarDays size={20} aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-lg font-bold">
          {view === "upcoming" ? copy.upcomingEmpty : copy.pastEmpty}
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-black/55">
          {view === "upcoming" ? copy.upcomingEmptyBody : copy.pastEmptyBody}
        </p>
      </div>
    </div>
  );
}
