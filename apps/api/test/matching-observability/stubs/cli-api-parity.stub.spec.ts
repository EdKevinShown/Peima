/**
 * STUB — CLI vs Admin API numeric parity (requires API + DB + admin JWT).
 *
 * Future: spawn CLI with --json to temp file, GET /admin/matching-observability/summary
 * with same limit/sinceDays, deep-compare aggregate fields (allow generatedAt drift).
 */
describe("matching observability · CLI vs API parity (stub)", () => {
  it.todo("pairwise.totalInWindow matches between CLI JSON and Admin API");
  it.todo("simulation.schemaValidationItemCountInWindow matches");
  it.todo("finalizeMeta.totalInWindow matches");
  it.todo("matchAndPreview.previewPoolsTotal matches");
});
