/**
 * P7.10-r3e — canonical match result sidecar migration contract (file-level; no DB required).
 */
import * as fs from "node:fs";
import * as path from "node:path";

const MIGRATION_SQL = path.join(
  __dirname,
  "../../../packages/database/prisma/migrations/20260519100000_p76_canonical_match_result_meta/migration.sql",
);

const SCHEMA_PRISMA = path.join(
  __dirname,
  "../../../packages/database/prisma/schema.prisma",
);

describe("P7.10-r3e canonical match result sidecar migration", () => {
  let sql: string;
  let schema: string;

  beforeAll(() => {
    sql = fs.readFileSync(MIGRATION_SQL, "utf8");
    schema = fs.readFileSync(SCHEMA_PRISMA, "utf8");
  });

  it("defines Prisma model P76CanonicalMatchResultMeta", () => {
    expect(schema).toMatch(/model P76CanonicalMatchResultMeta/);
    expect(schema).toMatch(/@@map\("p76_canonical_match_result_meta"\)/);
  });

  it("schema contains auditRunId and environment", () => {
    const block = schema.match(/model P76CanonicalMatchResultMeta \{[\s\S]*?\n\}/)?.[0];
    expect(block).toBeDefined();
    expect(block).toMatch(/auditRunId\s+String/);
    expect(block).toMatch(/environment\s+String/);
  });

  it("schema contains applied flags and promotionStatus", () => {
    expect(schema).toMatch(/appliedToMatchResult\s+Boolean/);
    expect(schema).toMatch(/appliedToFinalScore\s+Boolean/);
    expect(schema).toMatch(/appliedToWorkerRanking\s+Boolean/);
    expect(schema).toMatch(/promotionStatus\s+String/);
  });

  it("schema has unique auditRunId viewerUserId sourceVersion", () => {
    expect(schema).toMatch(
      /@@unique\(\[auditRunId, viewerUserId, sourceVersion\]\)/,
    );
  });

  it("creates p76_canonical_match_result_meta table", () => {
    expect(sql).toMatch(/CREATE TABLE "p76_canonical_match_result_meta"/);
  });

  it("enforces appliedToWorkerRanking=false CHECK", () => {
    expect(sql).toContain('"appliedToWorkerRanking" = false');
    expect(sql).toMatch(
      /p76_canonical_match_result_meta_applied_to_worker_ranking_false/,
    );
  });

  it("enforces mode enum CHECK", () => {
    expect(sql).toContain("CHECK (\"mode\" IN ('dry_run', 'sidecar', 'promoted'))");
  });

  it("enforces promotionStatus enum CHECK", () => {
    expect(sql).toContain(
      "CHECK (\"promotionStatus\" IN ('not_promoted', 'promoted', 'rolled_back', 'blocked'))",
    );
  });

  it("enforces appliedToMatchResult requires promoted CHECK", () => {
    expect(sql).toMatch(
      /appliedToMatchResult" = true AND "promotionStatus" <> 'promoted'/,
    );
  });

  it("enforces environment dev|staging CHECK", () => {
    expect(sql).toContain("CHECK (\"environment\" IN ('dev', 'staging'))");
  });

  it("has unique auditRunId viewerUserId sourceVersion index", () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX "p76_canonical_match_result_meta_auditRunId_viewerUserId_sourceVersion_key"/,
    );
  });

  it("does not add MatchResult FK or alter match_results", () => {
    expect(sql).not.toMatch(/REFERENCES "match_results"/i);
    expect(sql).not.toMatch(/ALTER TABLE "match_results"/i);
    expect(sql).not.toMatch(/UPDATE "match_results"/i);
  });

  it("does not add foreign keys in v1", () => {
    expect(sql).not.toMatch(/FOREIGN KEY/i);
  });

  it("does not add MatchResult reverse relation", () => {
    const matchResultBlock = schema.match(/model MatchResult \{[\s\S]*?\n\}/)?.[0];
    expect(matchResultBlock).toBeDefined();
    expect(matchResultBlock).not.toMatch(/P76CanonicalMatchResultMeta/);
  });
});
