import type { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { db } from "@/db";
import { user } from "@/db/auth-schema";
import {
  appointments,
  availabilitySlots,
  providerProfiles,
  providerStudents,
} from "@/db/schema";
import {
  createProviderStudent,
  deleteProviderStudent,
  listProviderStudents,
  updateProviderStudent,
} from "@/lib/provider-appointments";
import { providerStudentUpdateSchema } from "@/lib/provider-appointment";

// Run the real service, ORM and migrations against PostgreSQL in memory.
// Only the connection changes; these tests never contact the live database.
vi.mock("@/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { btree_gist } =
    await import("@electric-sql/pglite/contrib/btree_gist");
  const { drizzle } = await import("drizzle-orm/pglite");
  return { db: drizzle(new PGlite({ extensions: { btree_gist } })) };
});
const testDb = db as unknown as PgliteDatabase & { $client: PGlite };
const provider = "provider-one";
const otherProvider = "provider-two";
const email = "ada@example.com";
let editedId: string;

beforeAll(async () => {
  await migrate(testDb, { migrationsFolder: "./drizzle" });
}, 30_000);
afterAll(async () => {
  await testDb.$client.close();
});
beforeEach(async () => {
  await testDb.execute(sql`truncate table "user" cascade`);
  await testDb.insert(user).values([
    { id: provider, name: "Provider One", email: "provider-one@example.com" },
    {
      id: otherProvider,
      name: "Provider Two",
      email: "provider-two@example.com",
    },
    {
      id: "registered-student",
      name: "Ada Account",
      email,
      emailVerified: true,
    },
  ]);
  await testDb
    .insert(providerProfiles)
    .values([{ userId: provider }, { userId: otherProvider }]);
  const [student] = await testDb
    .insert(providerStudents)
    .values({
      providerId: provider,
      displayName: "Ada",
      email: null,
    })
    .returning();
  editedId = student.id;
});

async function seedStudent(
  owner: string,
  studentEmail = email,
  isActive = true,
) {
  const [student] = await testDb
    .insert(providerStudents)
    .values({
      providerId: owner,
      displayName: "Existing Ada",
      email: studentEmail,
      isActive,
    })
    .returning();
  return student;
}

describe("student email edits against PostgreSQL", () => {
  it("accepts an email already registered in the users table", async () => {
    const student = await updateProviderStudent(
      provider,
      editedId,
      providerStudentUpdateSchema.parse({ email: " ADA@EXAMPLE.COM " }),
    );
    expect(student).toMatchObject({ id: editedId, email, isActive: true });
    expect(
      (
        await testDb
          .select()
          .from(user)
          .where(eq(user.id, "registered-student"))
      )[0],
    ).toMatchObject({ email, emailVerified: true });
  });

  it.each([true, false])(
    "allows an email from another provider's list (active: %s)",
    async (isActive) => {
      const other = await seedStudent(otherProvider, email, isActive);
      await expect(
        updateProviderStudent(provider, editedId, { email }),
      ).resolves.toMatchObject({ id: editedId, email });
      expect(
        (
          await testDb
            .select()
            .from(providerStudents)
            .where(eq(providerStudents.id, other.id))
        )[0],
      ).toEqual(other);
    },
  );

  it("allows a hidden student's email without changing their record or appointments", async () => {
    const hidden = await seedStudent(provider, email, false);
    const [slot] = await testDb
      .insert(availabilitySlots)
      .values({
        teacherId: provider,
        startsAt: new Date("2030-01-15T09:00:00Z"),
        endsAt: new Date("2030-01-15T09:45:00Z"),
      })
      .returning();
    const [session] = await testDb
      .insert(appointments)
      .values({
        slotId: slot.id,
        providerStudentId: hidden.id,
        studentId: "registered-student",
        recurrence: "weekly",
        status: "scheduled",
        comment: "Preserve this history",
      })
      .returning();
    await expect(
      updateProviderStudent(provider, editedId, { email }),
    ).resolves.toMatchObject({ id: editedId, email });
    expect(await listProviderStudents(provider)).toHaveLength(1);
    expect(
      (
        await testDb
          .select()
          .from(providerStudents)
          .where(eq(providerStudents.id, hidden.id))
      )[0],
    ).toEqual(hidden);
    expect(
      (
        await testDb
          .select()
          .from(appointments)
          .where(eq(appointments.id, session.id))
      )[0],
    ).toEqual(session);
  });

  it("names the visible student who already owns the email and preserves both entries", async () => {
    await seedStudent(provider);
    const before = await testDb.select().from(providerStudents);
    await expect(
      updateProviderStudent(provider, editedId, { email }),
    ).rejects.toMatchObject({
      code: "student_email_conflict",
      studentName: "Existing Ada",
      message: "This email already belongs to Existing Ada.",
    });
    expect(await testDb.select().from(providerStudents)).toEqual(before);
  });

  it("detects mixed-case legacy email duplicates within this provider's active list", async () => {
    await seedStudent(provider, " ADA@Example.com ");
    await expect(
      updateProviderStudent(provider, editedId, { email }),
    ).rejects.toMatchObject({
      code: "student_email_conflict",
      studentName: "Existing Ada",
    });
  });

  it("allows saving the same email repeatedly", async () => {
    await updateProviderStudent(provider, editedId, { email });
    await expect(
      updateProviderStudent(provider, editedId, {
        email,
        displayName: "Ada Renamed",
      }),
    ).resolves.toMatchObject({ id: editedId, displayName: "Ada Renamed" });
    expect(await listProviderStudents(provider)).toHaveLength(1);
  });

  it.each([{}, { email: "" }])(
    "supports name-only edits and clearing email (%j)",
    async (input) => {
      await updateProviderStudent(provider, editedId, { email });
      await seedStudent(provider, "different@example.com");
      await updateProviderStudent(
        provider,
        editedId,
        providerStudentUpdateSchema.parse({
          displayName: "Ada Updated",
          ...input,
        }),
      );
      const [student] = await testDb
        .select()
        .from(providerStudents)
        .where(eq(providerStudents.id, editedId));
      expect(student.email).toBe("email" in input ? null : email);
      expect(await listProviderStudents(provider)).toHaveLength(2);
    },
  );

  it.each(["another provider", "removed student", "missing student"])(
    "cannot edit %s",
    async (kind) => {
      if (kind === "removed student")
        await deleteProviderStudent(provider, editedId);
      const before = await testDb.select().from(providerStudents);
      await expect(
        updateProviderStudent(
          kind === "another provider" ? otherProvider : provider,
          kind === "missing student"
            ? "00000000-0000-0000-0000-000000000000"
            : editedId,
          { email },
        ),
      ).rejects.toMatchObject({ name: "ProviderStudentNotFoundError" });
      expect(await testDb.select().from(providerStudents)).toEqual(before);
    },
  );

  it("reactivates a removed student when creating them again", async () => {
    const hidden = await seedStudent(provider, email, false);
    expect(
      await createProviderStudent(provider, {
        displayName: "Ada Restored",
        email,
      }),
    ).toMatchObject({
      id: hidden.id,
      displayName: "Ada Restored",
      isActive: true,
    });
  });

  it("reuses the active student instead of a hidden entry with the same email", async () => {
    await seedStudent(provider, email, false);
    await updateProviderStudent(provider, editedId, { email });
    expect(
      await createProviderStudent(provider, {
        displayName: "Ada Account",
        email,
      }),
    ).toMatchObject({ id: editedId });
    expect(await listProviderStudents(provider)).toHaveLength(1);
  });

  it("enforces case-insensitive uniqueness in SQL for active students only", async () => {
    await seedStudent(provider, "ADA@example.com");
    await expect(seedStudent(provider, email)).rejects.toThrow();
    await expect(seedStudent(otherProvider, email)).resolves.toBeDefined();
  });
});
