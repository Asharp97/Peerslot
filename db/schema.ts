import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  primaryKey,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { CalendarMoves } from "@/lib/calendar-moves";

import { user } from "@/db/auth-schema";

export const appointmentStatus = pgEnum("appointment_status", [
  "pending",
  "scheduled",
  "declined",
  "cancelled",
]);

export const availabilityRecurrence = pgEnum("availability_recurrence", [
  "none",
  "weekly",
]);

export const profiles = pgTable("profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  preferences: jsonb("preferences")
    .$type<{
      language: "en" | "tr";
      dateFormat: "dmy" | "mdy" | "ymd";
      timeFormat: "12" | "24";
    }>()
    .default({ language: "en", dateFormat: "dmy", timeFormat: "24" })
    .notNull(),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  })
    .defaultNow()
    .notNull(),
});

export const apiRateLimits = pgTable("api_rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetsAt: timestamp("resets_at", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "date",
  })
    .defaultNow()
    .notNull(),
});

export const providerProfiles = pgTable(
  "provider_profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    displayName: text("display_name").default("Provider").notNull(),
    professionalTitle: text("professional_title")
      .default("Professional")
      .notNull(),
    timeZone: text("time_zone").default("UTC").notNull(),
    defaultAppointmentDurationMinutes: integer(
      "default_appointment_duration_minutes",
    )
      .default(30)
      .notNull(),
    minimumBookingNoticeMinutes: integer("minimum_booking_notice_minutes")
      .default(24 * 60)
      .notNull(),
    restBetweenSessionsMinutes: integer("rest_between_sessions_minutes")
      .default(10)
      .notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      "provider_duration_valid",
      sql`${table.defaultAppointmentDurationMinutes} between 10 and 90 and mod(${table.defaultAppointmentDurationMinutes}, 5) = 0`,
    ),
    check(
      "provider_booking_notice_valid",
      sql`${table.minimumBookingNoticeMinutes} between 0 and 43200`,
    ),
    check(
      "provider_rest_time_valid",
      sql`${table.restBetweenSessionsMinutes} between 0 and 60 and mod(${table.restBetweenSessionsMinutes}, 5) = 0`,
    ),
  ],
);

export const bookingPages = pgTable(
  "booking_pages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    providerId: text("provider_id")
      .notNull()
      .unique()
      .references(() => providerProfiles.userId, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique(),
    title: text("title").default("Book a meeting").notNull(),
    timeZone: text("time_zone").default("UTC").notNull(),
    appointmentDurationMinutes: integer("appointment_duration_minutes")
      .default(30)
      .notNull(),
    bookingIntervalMinutes: integer("booking_interval_minutes")
      .default(30)
      .notNull(),
    minimumNoticeHours: integer("minimum_notice_hours").default(24).notNull(),
    weeklyRescheduleLimit: integer("weekly_reschedule_limit")
      .default(1)
      .notNull(),
    isPublished: boolean("is_published").default(true).notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      "booking_page_weekly_reschedule_limit_valid",
      sql`${table.weeklyRescheduleLimit} between 0 and 10`,
    ),
    check("booking_page_slug_length", sql`char_length(${table.slug}) = 8`),
    check(
      "booking_page_duration_valid",
      sql`${table.appointmentDurationMinutes} between 10 and 90 and mod(${table.appointmentDurationMinutes}, 5) = 0`,
    ),
    check(
      "booking_page_interval_valid",
      sql`${table.bookingIntervalMinutes} between 10 and 150 and mod(${table.bookingIntervalMinutes}, 5) = 0`,
    ),
    check(
      "booking_page_interval_covers_duration",
      sql`${table.bookingIntervalMinutes} >= ${table.appointmentDurationMinutes}`,
    ),
    check(
      "booking_page_notice_valid",
      sql`${table.minimumNoticeHours} between 0 and 720`,
    ),
  ],
);

export const clientRescheduleUsage = pgTable(
  "client_reschedule_usage",
  {
    providerId: text("provider_id")
      .notNull()
      .references(() => providerProfiles.userId, { onDelete: "cascade" }),
    clientId: text("client_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    weekStartsOn: date("week_starts_on").notNull(),
    rescheduleCount: integer("reschedule_count").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.providerId, table.clientId, table.weekStartsOn],
    }),
    check(
      "client_reschedule_usage_count_positive",
      sql`${table.rescheduleCount} > 0`,
    ),
    index("client_reschedule_usage_client_idx").on(table.clientId),
  ],
);

export const providerGoogleMeetConnections = pgTable(
  "provider_google_meet_connections",
  {
    providerId: text("provider_id")
      .primaryKey()
      .references(() => providerProfiles.userId, { onDelete: "cascade" }),
    googleAccountId: text("google_account_id").notNull(),
    email: text("email").notNull(),
    encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
    connectedAt: timestamp("connected_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
);

export const availabilityWindows = pgTable(
  "availability_windows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bookingPageId: uuid("booking_page_id")
      .notNull()
      .references(() => bookingPages.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    endsAt: timestamp("ends_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    moves: jsonb("moves").$type<CalendarMoves>().default({}).notNull(),
    recurrence: availabilityRecurrence("recurrence").default("none").notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("availability_windows_booking_page_idx").on(table.bookingPageId),
    check(
      "availability_window_ends_after_start",
      sql`${table.endsAt} > ${table.startsAt}`,
    ),
  ],
);

export const availabilitySlots = pgTable(
  "availability_slots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    teacherId: text("teacher_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    availabilityWindowId: uuid("availability_window_id").references(
      () => availabilityWindows.id,
      { onDelete: "cascade" },
    ),
    startsAt: timestamp("starts_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    endsAt: timestamp("ends_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("availability_slots_window_idx").on(table.availabilityWindowId),
    index("availability_slots_teacher_start_idx").on(
      table.teacherId,
      table.startsAt,
    ),
    uniqueIndex("availability_slot_teacher_range_unique").on(
      table.teacherId,
      table.startsAt,
      table.endsAt,
    ),
    check("slot_ends_after_start", sql`${table.endsAt} > ${table.startsAt}`),
  ],
);

export const providerStudents = pgTable(
  "provider_students",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    providerId: text("provider_id")
      .notNull()
      .references(() => providerProfiles.userId, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    email: text("email"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("provider_students_provider_idx").on(table.providerId),
    // Removed students retain their history without reserving an email in
    // the provider's active list. Accounts and other providers are independent.
    uniqueIndex("provider_students_provider_email_unique")
      .on(table.providerId, sql`lower(btrim(${table.email}))`)
      .where(sql`${table.isActive} = true`),
  ],
);

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    studentId: text("student_id").references(() => user.id, {
      onDelete: "cascade",
    }),
    providerStudentId: uuid("provider_student_id").references(
      () => providerStudents.id,
      { onDelete: "cascade" },
    ),
    slotId: uuid("slot_id")
      .notNull()
      .references(() => availabilitySlots.id),
    rescheduleCount: integer("reschedule_count").default(0).notNull(),
    status: appointmentStatus("status").default("scheduled").notNull(),
    comment: text("comment"),
    meetingUrl: text("meeting_url"),
    meetingSpaceName: text("meeting_space_name"),
    meetingCreatingAt: timestamp("meeting_creating_at", {
      withTimezone: true,
      mode: "date",
    }),
    recurrence: availabilityRecurrence("recurrence").default("none").notNull(),
    recurrenceEndsAt: timestamp("recurrence_ends_at", {
      withTimezone: true,
      mode: "date",
    }),
    exceptionForAppointmentId: uuid("exception_for_appointment_id"),
    exceptionOriginalStartsAt: timestamp("exception_original_starts_at", {
      withTimezone: true,
      mode: "date",
    }),
    color: text("color").default("#f0d7ff").notNull(),
    deletedAt: timestamp("deleted_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdByProvider: boolean("created_by_provider").default(false).notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("appointment_slot_unique")
      .on(table.slotId)
      // Weekly rows are recurrence templates; exceptions can free their seed
      // time while the rest of the series continues. Reserve physical slots
      // only for live one-time occurrences, including recurring exceptions.
      .where(
        sql`${table.status} in ('pending', 'scheduled') and ${table.deletedAt} is null and ${table.recurrence} = 'none'`,
      ),
    index("appointments_student_idx").on(table.studentId),
    index("appointments_provider_student_idx").on(table.providerStudentId),
    index("appointments_exception_series_idx").on(
      table.exceptionForAppointmentId,
    ),
    uniqueIndex("appointments_series_occurrence_unique").on(
      table.exceptionForAppointmentId,
      table.exceptionOriginalStartsAt,
    ),
    foreignKey({
      columns: [table.exceptionForAppointmentId],
      foreignColumns: [table.id],
      name: "appointments_exception_series_fk",
    }).onDelete("cascade"),
    check("reschedule_count_valid", sql`${table.rescheduleCount} >= 0`),
    check(
      "appointment_student_present",
      sql`${table.studentId} is not null or ${table.providerStudentId} is not null`,
    ),
    check(
      "appointment_exception_fields_paired",
      sql`(${table.exceptionForAppointmentId} is null) = (${table.exceptionOriginalStartsAt} is null)`,
    ),
    check(
      "appointment_exception_not_recurring",
      sql`${table.exceptionForAppointmentId} is null or ${table.recurrence} = 'none'`,
    ),
    check(
      "appointment_recurrence_end_only_on_series",
      sql`${table.recurrenceEndsAt} is null or (${table.recurrence} = 'weekly' and ${table.exceptionForAppointmentId} is null)`,
    ),
    check("appointment_color_hex", sql`${table.color} ~ '^#[0-9A-Fa-f]{6}$'`),
  ],
);

export const personalActivities = pgTable(
  "personal_activities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    providerId: text("provider_id")
      .notNull()
      .references(() => providerProfiles.userId, { onDelete: "cascade" }),
    name: text("name").notNull(),
    defaultDurationMinutes: integer("default_duration_minutes"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("personal_activities_provider_name_unique").on(
      table.providerId,
      sql`lower(btrim(${table.name}))`,
    ),
    check(
      "personal_activity_duration_valid",
      sql`${table.defaultDurationMinutes} is null or ${table.defaultDurationMinutes} between 1 and 1440`,
    ),
    check(
      "personal_activity_name_valid",
      sql`char_length(btrim(${table.name})) between 1 and 100`,
    ),
  ],
);

export const personalActivitySchedules = pgTable(
  "personal_activity_schedules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => personalActivities.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    endsAt: timestamp("ends_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    moves: jsonb("moves").$type<CalendarMoves>().default({}).notNull(),
    recurrence: availabilityRecurrence("recurrence").default("none").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("personal_activity_schedules_activity_start_idx").on(
      table.activityId,
      table.startsAt,
    ),
    check(
      "personal_activity_schedule_range_valid",
      sql`${table.endsAt} > ${table.startsAt} and ${table.endsAt} <= ${table.startsAt} + interval '24 hours'`,
    ),
  ],
);
