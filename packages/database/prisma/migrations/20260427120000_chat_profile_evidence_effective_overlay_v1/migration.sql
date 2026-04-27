-- P6 v1: chat profile evidence layer + derived effective overlay JSON on user_profile (no worker / finalScore).

CREATE TABLE "chat_profile_evidence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "axisId" INTEGER NOT NULL,
    "branch" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "suggestionId" TEXT,
    "acceptedByUser" BOOLEAN NOT NULL DEFAULT true,
    "sessionQualityBucket" TEXT NOT NULL,
    "sessionQualityWeight" DOUBLE PRECISION NOT NULL,
    "freshnessBucket" TEXT NOT NULL,
    "freshnessWeight" DOUBLE PRECISION NOT NULL,
    "evidenceWeight" DOUBLE PRECISION NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_profile_evidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "chat_profile_evidence_userId_conversationId_axisId_key" ON "chat_profile_evidence"("userId", "conversationId", "axisId");

CREATE INDEX "chat_profile_evidence_userId_axisId_idx" ON "chat_profile_evidence"("userId", "axisId");

ALTER TABLE "chat_profile_evidence" ADD CONSTRAINT "chat_profile_evidence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_profile" ADD COLUMN "effectiveProfileChatOverlayV1" JSONB;
