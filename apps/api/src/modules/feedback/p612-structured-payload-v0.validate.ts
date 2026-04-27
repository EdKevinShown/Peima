import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@peima/database";

export const P612_CHAT_FEEDBACK_SOURCE_VERSION = "p6.12-chat-feedback-structured-v0";
export const P612_CONVERSATION_KIND = "p6.12_conversation_v0";
const P612_SCHEMA_VERSION = 1;

const RATING_KEYS = [
  "overallRating",
  "continueIntent",
  "comfortLevel",
  "replyQuality",
  "safetyFeeling",
  "awkwardness",
] as const;

function isInt1to5(n: unknown): n is number {
  return (
    typeof n === "number" &&
    Number.isInteger(n) &&
    n >= 1 &&
    n <= 5
  );
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/**
 * When client sends P6.12 structured feedback, validate shape and context fields.
 * Throws BadRequestException on error.
 */
export function assertValidP612StructuredPayloadV0(
  raw: unknown,
  ctx: {
    subjectKind: string;
    subjectId: string;
    sourceType: string;
    sourceVersion: string;
  },
): Prisma.InputJsonValue {
  if (raw == null) {
    throw new BadRequestException("structuredPayload: expected object");
  }
  if (!isRecord(raw)) {
    throw new BadRequestException("structuredPayload: must be a JSON object");
  }

  if (ctx.sourceVersion !== P612_CHAT_FEEDBACK_SOURCE_VERSION) {
    throw new BadRequestException(
      `structuredPayload: sourceVersion must be ${P612_CHAT_FEEDBACK_SOURCE_VERSION} when sending structured payload`,
    );
  }
  if (ctx.sourceType !== "rule_based") {
    throw new BadRequestException(
      "structuredPayload: sourceType must be rule_based for P6.12 v0",
    );
  }
  if (ctx.subjectKind !== "conversation") {
    throw new BadRequestException(
      "structuredPayload: subjectKind must be conversation for P6.12 v0",
    );
  }

  if (raw.schemaVersion !== P612_SCHEMA_VERSION) {
    throw new BadRequestException(
      `structuredPayload: schemaVersion must be ${P612_SCHEMA_VERSION}`,
    );
  }
  if (raw.kind !== P612_CONVERSATION_KIND) {
    throw new BadRequestException(
      `structuredPayload: kind must be ${P612_CONVERSATION_KIND}`,
    );
  }
  if (typeof raw.conversationId !== "string" || !raw.conversationId.trim()) {
    throw new BadRequestException("structuredPayload: conversationId is required");
  }
  if (raw.conversationId !== ctx.subjectId) {
    throw new BadRequestException(
      "structuredPayload: conversationId must match subjectId for conversation feedback",
    );
  }

  for (const k of RATING_KEYS) {
    if (!isInt1to5(raw[k])) {
      throw new BadRequestException(
        `structuredPayload: ${k} must be an integer from 1 to 5`,
      );
    }
  }

  if (raw.matchResultId !== undefined && raw.matchResultId !== null) {
    if (typeof raw.matchResultId !== "string" || !raw.matchResultId.trim()) {
      throw new BadRequestException("structuredPayload: matchResultId must be a non-empty string when set");
    }
  }
  if (raw.targetUserId !== undefined && raw.targetUserId !== null) {
    if (typeof raw.targetUserId !== "string" || !raw.targetUserId.trim()) {
      throw new BadRequestException("structuredPayload: targetUserId must be a non-empty string when set");
    }
  }

  const allowed = new Set<string>([
    "schemaVersion",
    "kind",
    "conversationId",
    "matchResultId",
    "targetUserId",
    ...RATING_KEYS,
  ]);
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) {
      throw new BadRequestException(
        `structuredPayload: unknown key "${key}"`,
      );
    }
  }

  const out: Prisma.JsonObject = {
    schemaVersion: P612_SCHEMA_VERSION,
    kind: P612_CONVERSATION_KIND,
    conversationId: raw.conversationId,
    overallRating: raw.overallRating as number,
    continueIntent: raw.continueIntent as number,
    comfortLevel: raw.comfortLevel as number,
    replyQuality: raw.replyQuality as number,
    safetyFeeling: raw.safetyFeeling as number,
    awkwardness: raw.awkwardness as number,
  };
  if (raw.matchResultId != null) {
    out.matchResultId = raw.matchResultId as string;
  }
  if (raw.targetUserId != null) {
    out.targetUserId = raw.targetUserId as string;
  }

  return out as Prisma.InputJsonValue;
}
