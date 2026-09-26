import { sql } from "drizzle-orm";
import { bookingPages } from "@/db/schema";

// Use the persisted setting, never a cached session or client-supplied role.
export const bookingProviderOffersAppointments = sql`exists (
  select 1 from "user" as offering_user
  where offering_user.id = ${bookingPages.providerId}
    and offering_user.offers_appointments = true
)`;

export function dashboardPath(offersAppointments: boolean) {
  return offersAppointments ? "/provider" : "/my-appointments";
}
