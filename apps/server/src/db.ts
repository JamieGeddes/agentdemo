import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { buildSeedTickets, seedAgents, seedCustomers } from "@agentdemo/shared";

export type DB = Database.Database;

/**
 * Open (and create if needed) the SQLite database, ensure the schema exists,
 * and seed it from the shared fixtures the first time it's empty.
 */
export function createDb(file: string): DB {
  if (file !== ":memory:") {
    mkdirSync(dirname(file), { recursive: true });
  }
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  createSchema(db);
  seedIfEmpty(db);
  return db;
}

function createSchema(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id          TEXT PRIMARY KEY,
      company     TEXT NOT NULL,
      contactName TEXT NOT NULL,
      email       TEXT NOT NULL,
      plan        TEXT NOT NULL,
      slaTier     TEXT NOT NULL,
      seats       INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS agents (
      id     TEXT PRIMARY KEY,
      name   TEXT NOT NULL,
      avatar TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tickets (
      id         TEXT PRIMARY KEY,
      subject    TEXT NOT NULL,
      body       TEXT NOT NULL,
      status     TEXT NOT NULL,
      priority   TEXT NOT NULL,
      customerId TEXT NOT NULL REFERENCES customers(id),
      assigneeId TEXT REFERENCES agents(id),
      tags       TEXT NOT NULL DEFAULT '[]',
      createdAt  TEXT NOT NULL,
      updatedAt  TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id         TEXT PRIMARY KEY,
      ticketId   TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      author     TEXT NOT NULL,
      authorName TEXT NOT NULL,
      body       TEXT NOT NULL,
      createdAt  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_ticket ON messages(ticketId);
    CREATE TABLE IF NOT EXISTS activity (
      id        TEXT PRIMARY KEY,
      sessionId TEXT,
      kind      TEXT NOT NULL,
      ticketId  TEXT,
      summary   TEXT NOT NULL,
      detail    TEXT,
      createdAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_activity_session ON activity(sessionId);
  `);
}

/** Insert the seed fixtures. NO transaction of its own — callers wrap it. */
function insertSeedRows(db: DB): void {
  const insertCustomer = db.prepare(
    "INSERT INTO customers (id, company, contactName, email, plan, slaTier, seats) VALUES (@id, @company, @contactName, @email, @plan, @slaTier, @seats)",
  );
  const insertAgent = db.prepare("INSERT INTO agents (id, name, avatar) VALUES (@id, @name, @avatar)");
  const insertTicket = db.prepare(
    `INSERT INTO tickets (id, subject, body, status, priority, customerId, assigneeId, tags, createdAt, updatedAt)
     VALUES (@id, @subject, @body, @status, @priority, @customerId, @assigneeId, @tags, @createdAt, @updatedAt)`,
  );
  const insertMessage = db.prepare(
    `INSERT INTO messages (id, ticketId, author, authorName, body, createdAt)
     VALUES (@id, @ticketId, @author, @authorName, @body, @createdAt)`,
  );

  for (const c of seedCustomers) insertCustomer.run(c);
  for (const a of seedAgents) insertAgent.run(a);
  // Resolve timestamps against the actual seed moment so first boot and every
  // reset produce the same SLA mix relative to "now" (not frozen calendar dates).
  for (const t of buildSeedTickets()) {
    insertTicket.run({
      id: t.id,
      subject: t.subject,
      body: t.body,
      status: t.status,
      priority: t.priority,
      customerId: t.customerId,
      assigneeId: t.assigneeId,
      tags: JSON.stringify(t.tags),
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    });
    for (const m of t.messages) {
      insertMessage.run({ ...m, ticketId: t.id });
    }
  }
}

/** Seed the database from the shared fixtures (assumes the tables are empty). */
export function seedDatabase(db: DB): void {
  db.transaction(() => insertSeedRows(db))();
}

/**
 * Wipe all data and re-seed from the shared fixtures — the "reset to defaults"
 * a demo uses to undo a session's changes. Clears the activity log too. Runs in
 * one transaction; children are deleted before parents to respect FKs.
 */
export function resetDatabase(db: DB): void {
  const tables = ["messages", "activity", "tickets", "customers", "agents"];
  db.transaction(() => {
    for (const table of tables) db.prepare(`DELETE FROM ${table}`).run();
    insertSeedRows(db);
  })();
}

function seedIfEmpty(db: DB): void {
  const count = db.prepare("SELECT COUNT(*) AS n FROM tickets").get() as { n: number };
  if (count.n > 0) return;
  seedDatabase(db);
}
