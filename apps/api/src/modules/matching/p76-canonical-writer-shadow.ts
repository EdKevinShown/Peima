/**
 * P7.10-r6 — P7.6 canonical writer shadow (compare-only; never writes MatchResult).
 */

export {
  readP76CanonicalWriterShadowEnv,
  type P76CanonicalWriterShadowEnv,
} from "./p76-canonical-writer-shadow-env";

export {
  P76_CANONICAL_WRITER_SHADOW_PIPELINE_VERSION,
  P76_CANONICAL_WRITER_SHADOW_SCHEMA_VERSION,
  P76_CANONICAL_WRITER_SHADOW_SCORE_VERSION,
  P76_CANONICAL_WRITER_SHADOW_SOURCE_TYPE,
  P76_CANONICAL_WRITER_SHADOW_SOURCE_VERSION,
  type P76CanonicalWriterShadowBaselineInputV1,
  type P76CanonicalWriterShadowBuildInputV1,
  type P76CanonicalWriterShadowGuardrailReason,
  type P76CanonicalWriterShadowPayloadV1,
  type P76CanonicalWriterShadowProvenanceInputSource,
  type P76CanonicalWriterShadowScoreDeltaBand,
} from "./p76-canonical-writer-shadow.types";

export {
  assertCanonicalWriterShadowNeverWritesMatchResult,
  buildP76CanonicalWriterShadowPayloadV1,
} from "./p76-canonical-writer-shadow-builder";
