import type { Prisma } from "@peima/database";

/**
 * Public shape of `UserFeedback` for API responses (avoids Prisma-inferred return types in TS2742).
 * Keep in sync with `UserFeedback` in Prisma schema.
 */
export type FeedbackRecordResponse = {
  id: string;
  userId: string;
  subjectKind: string;
  subjectId: string;
  sourceType: string;
  sourceVersion: string;
  rating: number | null;
  tags: string[];
  comment: string | null;
  structuredPayload: Prisma.JsonValue | null;
  recordedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};
