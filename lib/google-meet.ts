import { symmetricDecrypt } from "better-auth/crypto";
import { and, eq, gt, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { appointments, availabilitySlots } from "@/db/schema";
import { getMeetConnection, googleMeetConfig } from "@/lib/google-meet-oauth";
import { isGoogleMeetUrl } from "@/lib/google-meet-url";

export type AppointmentMeetingResult = {
  status:
    | "ready"
    | "not_connected"
    | "not_configured"
    | "creating"
    | "failed"
    | "not_found"
    | "unavailable";
  meetingUrl?: string;
};

export async function ensureAppointmentMeeting(
  providerId: string,
  appointmentId: string,
): Promise<AppointmentMeetingResult> {
  const [current] = await db
    .select({ appointment: appointments, endsAt: availabilitySlots.endsAt })
    .from(appointments)
    .innerJoin(availabilitySlots, eq(appointments.slotId, availabilitySlots.id))
    .where(
      and(
        eq(appointments.id, appointmentId),
        eq(availabilitySlots.teacherId, providerId),
        isNull(appointments.deletedAt),
      ),
    )
    .limit(1);
  if (!current) return { status: "not_found" };
  const appointment = current.appointment;
  if (appointment.status !== "scheduled") return { status: "unavailable" };
  if (isGoogleMeetUrl(appointment.meetingUrl))
    return { status: "ready", meetingUrl: appointment.meetingUrl };
  if (
    appointment.recurrence === "none"
      ? current.endsAt <= new Date()
      : appointment.recurrenceEndsAt &&
        appointment.recurrenceEndsAt <= new Date()
  )
    return { status: "unavailable" };
  const config = googleMeetConfig();
  if (!config) return { status: "not_configured" };
  const connection = await getMeetConnection(providerId);
  if (!connection) return { status: "not_connected" };

  // A database lease prevents duplicate spaces across tabs and server instances.
  const startedAt = new Date();
  const [claimed] = await db
    .update(appointments)
    .set({ meetingCreatingAt: startedAt })
    .where(
      and(
        eq(appointments.id, appointmentId),
        eq(appointments.status, "scheduled"),
        isNull(appointments.deletedAt),
        isNull(appointments.meetingUrl),
        or(
          isNull(appointments.meetingCreatingAt),
          lt(
            appointments.meetingCreatingAt,
            new Date(startedAt.getTime() - 120_000),
          ),
        ),
      ),
    )
    .returning({ id: appointments.id });
  if (!claimed) return { status: "creating" };

  try {
    const refreshToken = await symmetricDecrypt({
      key: config.secret,
      data: connection.encryptedRefreshToken,
    });
    const { SpacesServiceClient } = await import("@google-apps/meet");
    // Only this known credential type is constructed; user-provided JSON is never loaded.
    const client = new SpacesServiceClient({
      fallback: true,
      credentials: {
        type: "authorized_user",
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: refreshToken,
      },
    });
    let space;
    try {
      [space] = await client.createSpace(
        { space: {} },
        { timeout: 15_000, retry: null },
      );
    } finally {
      await client.close().catch(() => undefined);
    }
    if (!isGoogleMeetUrl(space.meetingUri) || !space.name)
      throw new Error("Invalid Meet space");
    const [saved] = await db
      .update(appointments)
      .set({
        meetingUrl: space.meetingUri,
        meetingSpaceName: space.name,
        meetingCreatingAt: null,
      })
      .where(
        and(
          eq(appointments.id, appointmentId),
          eq(appointments.meetingCreatingAt, startedAt),
          eq(appointments.status, "scheduled"),
          isNull(appointments.deletedAt),
        ),
      )
      .returning({ id: appointments.id });
    return saved
      ? { status: "ready", meetingUrl: space.meetingUri }
      : { status: "unavailable" };
  } catch {
    // Never log Google responses: they can contain credentials.
    return { status: "failed" };
  } finally {
    await db
      .update(appointments)
      .set({ meetingCreatingAt: null })
      .where(
        and(
          eq(appointments.id, appointmentId),
          eq(appointments.meetingCreatingAt, startedAt),
        ),
      );
  }
}

export async function attachAppointmentMeeting<
  T extends { id: string; status: string; meetingUrl?: string | null },
>(providerId: string, appointment: T): Promise<T> {
  if (appointment.status !== "scheduled" || appointment.meetingUrl)
    return appointment;
  try {
    const meeting = await ensureAppointmentMeeting(providerId, appointment.id);
    return { ...appointment, meetingUrl: meeting.meetingUrl ?? null };
  } catch {
    // A saved appointment must remain successful even if provisioning fails.
    return appointment;
  }
}

export async function createUpcomingMeetings(providerId: string) {
  // Connecting also prepares existing upcoming sessions, once per weekly series.
  const rows = await db
    .select({ id: appointments.id })
    .from(appointments)
    .innerJoin(availabilitySlots, eq(appointments.slotId, availabilitySlots.id))
    .where(
      and(
        eq(availabilitySlots.teacherId, providerId),
        eq(appointments.status, "scheduled"),
        isNull(appointments.deletedAt),
        isNull(appointments.meetingUrl),
        or(
          gt(availabilitySlots.endsAt, new Date()),
          and(
            eq(appointments.recurrence, "weekly"),
            or(
              isNull(appointments.recurrenceEndsAt),
              gt(appointments.recurrenceEndsAt, new Date()),
            ),
          ),
        ),
      ),
    );
  for (let i = 0; i < rows.length; i += 4) {
    await Promise.allSettled(
      rows
        .slice(i, i + 4)
        .map(({ id }) => ensureAppointmentMeeting(providerId, id)),
    );
  }
}
