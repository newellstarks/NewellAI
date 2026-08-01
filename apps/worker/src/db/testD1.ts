/**
 * Test-only D1 stand-in backed by better-sqlite3, so tests exercise real
 * SQLite semantics (UNIQUE constraints, ON CONFLICT DO NOTHING, change counts)
 * against the actual migration SQL. Implements only the D1 surface the
 * persistence layer uses: prepare().bind().run() / .first().
 */
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import path from "node:path";

const MIGRATION_PATH = path.resolve(
  __dirname,
  "../../../../migrations/0001_init.sql",
);

class TestD1Statement {
  constructor(
    private readonly db: Database.Database,
    private readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]): TestD1Statement {
    return new TestD1Statement(this.db, this.sql, params);
  }

  async run(): Promise<{ success: boolean; meta: { changes: number } }> {
    const info = this.db.prepare(this.sql).run(...(this.params as never[]));
    return { success: true, meta: { changes: info.changes } };
  }

  async first<T>(): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...(this.params as never[]));
    return (row as T | undefined) ?? null;
  }
}

export class TestD1Database {
  readonly sqlite: Database.Database;

  constructor() {
    this.sqlite = new Database(":memory:");
    // D1 enforces foreign keys by default; better-sqlite3 does not.
    this.sqlite.pragma("foreign_keys = ON");
    this.sqlite.exec(readFileSync(MIGRATION_PATH, "utf-8"));
  }

  prepare(sql: string): TestD1Statement {
    return new TestD1Statement(this.sqlite, sql);
  }

  count(table: string): number {
    const row = this.sqlite
      .prepare(`SELECT COUNT(*) AS n FROM ${table}`)
      .get() as { n: number };
    return row.n;
  }
}

export function createTestD1(): { d1: D1Database; test: TestD1Database } {
  const test = new TestD1Database();
  return { d1: test as unknown as D1Database, test };
}
