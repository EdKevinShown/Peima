import type { MatchResult } from "@peima/database";
import type { PrismaService } from "../src/common/prisma/prisma.service";
import {
  projectMatchResultForViewer,
  resolveLatestMatchResultAccess,
} from "../src/modules/matching/matching-latest-result-access";

function row(partial: Partial<MatchResult> & Pick<MatchResult, "id" | "userId" | "candidateUserId">): MatchResult {
  return {
    batchId: "b1",
    finalScore: 0.8,
    reasonSummary: "ok",
    matchInsights: {},
    status: "ready",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

describe("matching-latest-result-access", () => {
  it("prefers outbound over inbound", async () => {
    const outbound = row({
      id: "out",
      userId: "u6",
      candidateUserId: "u7",
    });
    const prisma = {
      matchResult: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(outbound)
          .mockResolvedValueOnce(
            row({ id: "in", userId: "u7", candidateUserId: "u6" }),
          ),
      },
    };

    const access = await resolveLatestMatchResultAccess(
      prisma as unknown as Pick<PrismaService, "matchResult">,
      "u6",
    );
    expect(access?.kind).toBe("outbound");
    expect(access?.row.id).toBe("out");
    expect(prisma.matchResult.findFirst).toHaveBeenCalledTimes(1);
  });

  it("returns inbound when viewer has no outbound row", async () => {
    const inbound = row({
      id: "in",
      userId: "u7",
      candidateUserId: "u6",
    });
    const prisma = {
      matchResult: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(inbound),
      },
    };

    const access = await resolveLatestMatchResultAccess(
      prisma as unknown as Pick<PrismaService, "matchResult">,
      "u6",
    );
    expect(access?.kind).toBe("inbound");
    expect(projectMatchResultForViewer(access!)).toMatchObject({
      userId: "u6",
      candidateUserId: "u7",
    });
  });
});
