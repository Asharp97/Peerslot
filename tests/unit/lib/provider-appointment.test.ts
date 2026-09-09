import { describe, expect, it } from "vitest";

import {
  appointmentTimesChanged,
  providerAppointmentCreateSchema,
  providerAppointmentDeleteSchema,
  providerAppointmentRangeSchema,
  providerAppointmentUpdateSchema,
  providerStudentCreateSchema,
  providerStudentUpdateSchema,
} from "@/lib/provider-appointment";

const studentId = "7d45e9f4-6260-4dca-a95a-b5fa6c068cb8";

describe("provider student input", () => {
  it("normalizes a provider-managed student's name and email", () => {
    expect(
      providerStudentCreateSchema.parse({
        displayName: "  Ada Yilmaz  ",
        email: "  ADA@EXAMPLE.COM  ",
      }),
    ).toEqual({
      displayName: "Ada Yilmaz",
      email: "ada@example.com",
    });
  });

  it("allows editing a name and clearing an email", () => {
    expect(
      providerStudentUpdateSchema.parse({
        displayName: "  Ada Updated  ",
        email: "",
      }),
    ).toEqual({ displayName: "Ada Updated", email: null });
  });
});

describe("provider appointment input", () => {
  it("normalizes a provider-created session", () => {
    const result = providerAppointmentCreateSchema.parse({
      providerStudentId: studentId,
      startsAt: "2030-01-15T09:00:00+03:00",
      endsAt: "2030-01-15T09:45:00+03:00",
      comment: "Focus on geometry",
    });

    expect(result.startsAt.toISOString()).toBe("2030-01-15T06:00:00.000Z");
    expect(result.endsAt.toISOString()).toBe("2030-01-15T06:45:00.000Z");
    expect(result.comment).toBe("Focus on geometry");
  });

  it.each(["examName", "schoolYear"])(
    "rejects the removed %s field",
    (field) => {
      const result = providerAppointmentCreateSchema.safeParse({
        providerStudentId: studentId,
        startsAt: "2030-01-15T09:00:00Z",
        endsAt: "2030-01-15T09:45:00Z",
        [field]: "legacy context",
      });

      expect(result.success).toBe(false);
      expect(
        providerAppointmentUpdateSchema.safeParse({
          comment: "Keep this note",
          [field]: "legacy context",
        }).success,
      ).toBe(false);
    },
  );

  it("requires a positive session duration", () => {
    const result = providerAppointmentCreateSchema.safeParse({
      providerStudentId: studentId,
      startsAt: "2030-01-15T09:45:00Z",
      endsAt: "2030-01-15T09:00:00Z",
    });

    expect(result.success).toBe(false);
  });

  it("accepts a paired date change as a one-off reschedule", () => {
    const result = providerAppointmentUpdateSchema.parse({
      startsAt: "2030-01-16T10:00:00Z",
      endsAt: "2030-01-16T10:45:00Z",
      comment: "One-off change",
    });

    expect(result.startsAt).toEqual(new Date("2030-01-16T10:00:00Z"));
    expect(result.comment).toBe("One-off change");
  });

  it("accepts weekly sessions and validates their color", () => {
    const result = providerAppointmentCreateSchema.parse({
      providerStudentId: studentId,
      startsAt: "2030-01-15T09:00:00Z",
      endsAt: "2030-01-15T09:45:00Z",
      recurrence: "weekly",
      color: "#034f46",
    });

    expect(result).toMatchObject({ recurrence: "weekly", color: "#034f46" });
    expect(
      providerAppointmentCreateSchema.safeParse({
        providerStudentId: studentId,
        startsAt: "2030-01-15T09:00:00Z",
        endsAt: "2030-01-15T09:45:00Z",
        color: "green",
      }).success,
    ).toBe(false);
  });

  it("parses the selected occurrence and recurring edit scope", () => {
    const result = providerAppointmentUpdateSchema.parse({
      color: "#ffa946",
      editScope: "exception",
      occurrenceStartsAt: "2030-01-15T09:00:00Z",
    });

    expect(result.occurrenceStartsAt).toEqual(new Date("2030-01-15T09:00:00Z"));
    expect(result.editScope).toBe("exception");
  });

  it("requires an occurrence when editing this and future sessions", () => {
    expect(
      providerAppointmentUpdateSchema.safeParse({
        color: "#ffa946",
        editScope: "future",
      }).success,
    ).toBe(false);
    expect(
      providerAppointmentUpdateSchema.parse({
        color: "#ffa946",
        editScope: "future",
        occurrenceStartsAt: "2030-01-22T09:00:00Z",
      }),
    ).toMatchObject({
      editScope: "future",
      occurrenceStartsAt: new Date("2030-01-22T09:00:00Z"),
    });
  });

  it("parses deletion scope and the selected occurrence", () => {
    expect(
      providerAppointmentDeleteSchema.parse({
        deleteScope: "future",
        occurrenceStartsAt: "2030-01-22T09:00:00Z",
      }),
    ).toEqual({
      deleteScope: "future",
      occurrenceStartsAt: new Date("2030-01-22T09:00:00Z"),
    });
  });

  it("rejects a partial date change", () => {
    expect(
      providerAppointmentUpdateSchema.safeParse({
        startsAt: "2030-01-16T10:00:00Z",
      }).success,
    ).toBe(false);
    expect(providerAppointmentUpdateSchema.safeParse({}).success).toBe(false);
  });

  it("limits calendar requests to 45 days", () => {
    expect(
      providerAppointmentRangeSchema.safeParse({
        startsAt: "2030-01-01T00:00:00Z",
        endsAt: "2030-03-01T00:00:00Z",
      }).success,
    ).toBe(false);
  });

  it("does not count metadata saves as reschedules when times are unchanged", () => {
    const current = {
      startsAt: new Date("2030-01-16T10:00:00Z"),
      endsAt: new Date("2030-01-16T10:45:00Z"),
    };

    expect(appointmentTimesChanged(current, current)).toBe(false);
    expect(
      appointmentTimesChanged(
        { ...current, startsAt: new Date("2030-01-16T11:00:00Z") },
        current,
      ),
    ).toBe(true);
  });
});
