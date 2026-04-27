import { BadRequestException } from "@nestjs/common";
import {
  assertValidP612StructuredPayloadV0,
  P612_CHAT_FEEDBACK_SOURCE_VERSION,
} from "../src/modules/feedback/p612-structured-payload-v0.validate";

const validCtx = {
  subjectKind: "conversation" as const,
  subjectId: "c_conv_1",
  sourceType: "rule_based" as const,
  sourceVersion: P612_CHAT_FEEDBACK_SOURCE_VERSION,
};

function minPayload(over: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    kind: "p6.12_conversation_v0",
    conversationId: "c_conv_1",
    overallRating: 4,
    continueIntent: 3,
    comfortLevel: 4,
    replyQuality: 3,
    safetyFeeling: 4,
    awkwardness: 2,
    ...over,
  };
}

describe("assertValidP612StructuredPayloadV0 (P6.12)", () => {
  it("accepts a minimal valid v0 payload and normalizes", () => {
    const j = assertValidP612StructuredPayloadV0(
      minPayload(),
      validCtx,
    ) as Record<string, unknown>;
    expect(j.schemaVersion).toBe(1);
    expect(j.kind).toBe("p6.12_conversation_v0");
    expect(j.conversationId).toBe("c_conv_1");
    expect(j.overallRating).toBe(4);
  });

  it("optional matchResultId and targetUserId", () => {
    const j = assertValidP612StructuredPayloadV0(
      minPayload({
        matchResultId: "m1",
        targetUserId: "u2",
      }),
      validCtx,
    ) as Record<string, unknown>;
    expect(j.matchResultId).toBe("m1");
    expect(j.targetUserId).toBe("u2");
  });

  it("rejects when conversationId !== subjectId", () => {
    expect(() =>
      assertValidP612StructuredPayloadV0(
        minPayload({ conversationId: "other" }),
        validCtx,
      ),
    ).toThrow(BadRequestException);
  });

  it("rejects when sourceVersion is not P6.12", () => {
    expect(() =>
      assertValidP612StructuredPayloadV0(minPayload(), {
        ...validCtx,
        sourceVersion: "p4-post-chat-action-hub-v1",
      }),
    ).toThrow(BadRequestException);
  });

  it("rejects non-integer 1–5 on dimension", () => {
    expect(() =>
      assertValidP612StructuredPayloadV0(
        minPayload({ continueIntent: 2.5 }),
        validCtx,
      ),
    ).toThrow(BadRequestException);
  });

  it("rejects unknown keys", () => {
    expect(() =>
      assertValidP612StructuredPayloadV0(
        { ...minPayload(), extra: 1 } as never,
        validCtx,
      ),
    ).toThrow(BadRequestException);
  });
});
