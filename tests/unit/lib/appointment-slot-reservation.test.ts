import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { appointments } from "@/db/schema";

// Execute the production index predicate with real SQL uniqueness enforcement.
// These rules use standard SQL supported by both SQLite and PostgreSQL.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (path: string) => {
    exec(sql: string): void;
    close(): void;
  };
};
let database: InstanceType<typeof DatabaseSync>;

beforeEach(() => {
  database = new DatabaseSync(":memory:");
  database.exec(`CREATE TABLE appointments (
    id TEXT PRIMARY KEY, slot_id TEXT NOT NULL, status TEXT NOT NULL,
    recurrence TEXT NOT NULL, deleted_at TEXT
  )`);
  const index = getTableConfig(appointments).indexes.find(
    (index) => index.config.name === "appointment_slot_unique",
  )!;
  const predicate = new PgDialect().sqlToQuery(index.config.where!).sql;
  database.exec(
    `CREATE UNIQUE INDEX appointment_slot_unique ON appointments (slot_id) WHERE ${predicate}`,
  );
});
afterEach(() => database.close());

describe("appointment slot reservations", () => {
  it.each(["none", "weekly"])(
    "reuses a deleted session's slot for a new %s session",
    (recurrence) => {
      database.exec(
        "INSERT INTO appointments VALUES ('deleted', 'same-time', 'scheduled', 'none', '2030-01-01')",
      );
      expect(() =>
        database.exec(
          `INSERT INTO appointments VALUES ('replacement', 'same-time', 'scheduled', '${recurrence}', NULL)`,
        ),
      ).not.toThrow();
    },
  );

  it.each(["none", "weekly"])(
    "allows a new %s session at a recurring seed time freed by an exception or series cutoff",
    (recurrence) => {
      database.exec(
        "INSERT INTO appointments VALUES ('series-template', 'same-time', 'scheduled', 'weekly', NULL)",
      );
      database.exec(
        "INSERT INTO appointments VALUES ('deleted-occurrence', 'same-time', 'scheduled', 'none', '2030-01-01')",
      );
      expect(() =>
        database.exec(
          `INSERT INTO appointments VALUES ('replacement', 'same-time', 'scheduled', '${recurrence}', NULL)`,
        ),
      ).not.toThrow();
    },
  );

  it.each(["scheduled", "pending"])(
    "still prevents two live one-time appointments from claiming a %s slot",
    (status) => {
      database.exec(
        `INSERT INTO appointments VALUES ('existing', 'same-time', '${status}', 'none', NULL)`,
      );
      expect(() =>
        database.exec(
          "INSERT INTO appointments VALUES ('duplicate', 'same-time', 'scheduled', 'none', NULL)",
        ),
      ).toThrow(/UNIQUE constraint failed/);
    },
  );
});
