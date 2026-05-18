/**
 * P7.10-r6e1 — migration SQL contract (file-level; no DB required).
 */
import * as fs from "node:fs";
import * as path from "node:path";

const MIGRATION_SQL = path.join(
  __dirname,
  "../../../packages/database/prisma/migrations/20260518120000_p76_canonical_writer_rehearsal_meta/migration.sql",
);

const SCHEMA_PRISMA = path.join(
  __dirname,
  "../../../packages/database/prisma/schema.prisma",
);

describe("P7.10-r6e1 rehearsal sidecar migration", () => {
  let sql: string;
  let schema: string;

  beforeAll(() => {
    sql = fs.readFileSync(MIGRATION_SQL, "utf8");
    schema = fs.readFileSync(SCHEMA_PRISMA, "utf8");
  });

  it("creates p76_canonical_writer_rehearsal_meta table", () => {
    expect(sql).toMatch(
      /CREATE TABLE "p76_canonical_writer_rehearsal_meta"/,
    );
  });

  it("enforces appliedToMatchResult=false CHECK", () => {
    expect(sql).toContain('"appliedToMatchResult" = false');
    expect(sql).toMatch(
      /p76_canonical_writer_rehearsal_meta_applied_to_match_result_false/,
    );
  });

  it("enforces environment dev|staging CHECK", () => {
    expect(sql).toContain("CHECK (\"environment\" IN ('dev', 'staging'))");
  });

  it("requires matchResultId and auditRunId NOT NULL", () => {
    expect(sql).toMatch(/"matchResultId" TEXT NOT NULL/);
    expect(sql).toMatch(/"auditRunId" TEXT NOT NULL/);
  });

  it("has unique (matchResultId, auditRunId, pipelineVersion)", () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX "p76_canonical_writer_rehearsal_meta_matchResultId_auditRunId_pipelineVersion_key"/,
    );
  });

  it("does not add foreign keys or alter match_results", () => {
    expect(sql).not.toMatch(/FOREIGN KEY/i);
    expect(sql).not.toMatch(/match_results/i);
    expect(sql).not.toMatch(/DROP TABLE/i);
  });

  it("defines Prisma model P76CanonicalWriterRehearsalMeta", () => {
    expect(schema).toMatch(/model P76CanonicalWriterRehearsalMeta/);
    expect(schema).toMatch(
      /@@map\("p76_canonical_writer_rehearsal_meta"\)/,
    );
    expect(schema).toMatch(
      /@@unique\(\[matchResultId, auditRunId, pipelineVersion\]\)/,
    );
  });

  it("does not add MatchResult reverse relation", () => {
    const matchResultBlock = schema.match(
      /model MatchResult \{[\s\S]*?\n\}/,
    )?.[0];
    expect(matchResultBlock).toBeDefined();
    expect(matchResultBlock).not.toMatch(/P76CanonicalWriterRehearsalMeta/);
    expect(matchResultBlock).not.toMatch(/rehearsalMeta/);
  });
});
