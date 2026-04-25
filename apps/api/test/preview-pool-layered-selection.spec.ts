import {
  assignLayeredSixUserIds,
  computeVisualSortScore,
  pickBackupCandidates,
  pickCompatCandidates,
  pickVisualCandidates,
  sortGAllByCompatOrder,
  type GatedCandidateForLayering,
} from "../src/modules/preview-pool/preview-pool-layered-selection";
import {
  applyPreviewVisualEnhanceStubGAll,
  parseVisualEnhancePayload,
  StubPreviewVisualEnhanceClient,
} from "../src/modules/preview-pool/visual-signal-enhance-stub";

function c(
  partial: Omit<GatedCandidateForLayering, "createdAt" | "firstImageId"> & {
    createdAt?: Date;
    firstImageId?: string | null;
  },
): GatedCandidateForLayering {
  const hasImage = partial.hasImage ?? false;
  const firstImageId =
    partial.firstImageId !== undefined
      ? partial.firstImageId
      : hasImage
        ? `img_${partial.id}`
        : null;
  return {
    createdAt: partial.createdAt ?? new Date("2020-01-01"),
    ...partial,
    firstImageId,
  };
}

describe("preview pool layered selection (step 2)", () => {
  const viewerPref = {
    minAge: 25,
    maxAge: 35,
    preferredCities: ["上海"],
    minHeight: 160,
    maxHeight: 190,
    educationPreferences: ["本科"],
    occupationPreferences: [] as string[],
    relationshipGoalPreferences: [] as string[],
    styleTags: ["简约", "运动"],
  };

  it("assignLayeredSixUserIds: G_all > 6, no duplicate ids", () => {
    const gAll: GatedCandidateForLayering[] = [];
    for (let i = 0; i < 8; i++) {
      gAll.push(
        c({
          id: `u${i}`,
          createdAt: new Date(2020, 0, 1 + i),
          age: 28,
          city: "上海",
          height: 170,
          education: "本科",
          occupation: "工程师",
          relationshipGoal: "认真恋爱",
          firstImageStyleTags: i < 2 ? ["简约"] : i < 4 ? ["运动"] : ["其他"],
          hasImage: true,
        }),
      );
    }
    const picks = assignLayeredSixUserIds(gAll, viewerPref);
    expect(picks).toHaveLength(6);
    const ids = picks.map((p) => p.candidateUserId);
    expect(new Set(ids).size).toBe(6);
  });

  it("G_photo >= 2: visual slots come from highest style-tag overlap first", () => {
    const gAll: GatedCandidateForLayering[] = [
      c({
        id: "low",
        createdAt: new Date(2020, 0, 1),
        age: 28,
        city: "上海",
        height: 170,
        education: "本科",
        occupation: "工程师",
        relationshipGoal: "认真恋爱",
        firstImageStyleTags: ["其他"],
        hasImage: true,
      }),
      c({
        id: "highA",
        createdAt: new Date(2020, 0, 2),
        age: 28,
        city: "上海",
        height: 170,
        education: "本科",
        occupation: "工程师",
        relationshipGoal: "认真恋爱",
        firstImageStyleTags: ["简约", "运动"],
        hasImage: true,
      }),
      c({
        id: "highB",
        createdAt: new Date(2020, 0, 3),
        age: 28,
        city: "上海",
        height: 170,
        education: "本科",
        occupation: "工程师",
        relationshipGoal: "认真恋爱",
        firstImageStyleTags: ["简约"],
        hasImage: true,
      }),
      ...["x4", "x5", "x6"].map((id, i) =>
        c({
          id,
          createdAt: new Date(2020, 0, 10 + i),
          age: 28,
          city: "上海",
          height: 170,
          education: "本科",
          occupation: "工程师",
          relationshipGoal: "认真恋爱",
          firstImageStyleTags: [],
          hasImage: true,
        }),
      ),
    ];
    const picks = assignLayeredSixUserIds(gAll, viewerPref);
    const v1 = picks.find((p) => p.rankInPool === 1)?.candidateUserId;
    const v2 = picks.find((p) => p.rankInPool === 2)?.candidateUserId;
    expect(new Set([v1, v2])).toEqual(new Set(["highA", "highB"]));
    expect(picks.filter((p) => p.borrowedVisual).length).toBe(0);
  });

  it("G_photo < 2 but |G_all| >= 6: visual borrows from compat order without error", () => {
    const gAll: GatedCandidateForLayering[] = [
      c({
        id: "onlyPhoto",
        createdAt: new Date(2020, 0, 5),
        age: 28,
        city: "上海",
        height: 170,
        education: "本科",
        occupation: "工程师",
        relationshipGoal: "认真恋爱",
        firstImageStyleTags: ["简约"],
        hasImage: true,
      }),
      ...["a", "b", "c", "d", "e"].map((suffix, i) =>
        c({
          id: `noimg_${suffix}`,
          createdAt: new Date(2020, 0, i),
          age: 28,
          city: "上海",
          height: 170,
          education: "本科",
          occupation: "工程师",
          relationshipGoal: "认真恋爱",
          firstImageStyleTags: [],
          hasImage: false,
        }),
      ),
    ];
    expect(gAll.filter((x) => x.hasImage).length).toBe(1);
    const picks = assignLayeredSixUserIds(gAll, viewerPref);
    expect(picks).toHaveLength(6);
    const borrowed = picks.filter((p) => p.rankInPool <= 2 && p.borrowedVisual);
    expect(borrowed.length).toBeGreaterThanOrEqual(1);
    expect(new Set(picks.map((p) => p.candidateUserId)).size).toBe(6);
  });

  it("pickVisualCandidates / pickCompat / pickBackup stay disjoint", () => {
    const gAll: GatedCandidateForLayering[] = [];
    for (let i = 0; i < 6; i++) {
      gAll.push(
        c({
          id: `p${i}`,
          createdAt: new Date(2021, 0, i + 1),
          age: 28,
          city: "上海",
          height: 170,
          education: "本科",
          occupation: "工程师",
          relationshipGoal: "认真恋爱",
          firstImageStyleTags: ["简约"],
          hasImage: true,
        }),
      );
    }
    const visual = pickVisualCandidates(gAll, viewerPref);
    const vset = new Set(visual.map((v) => v.userId));
    const compat = pickCompatCandidates(gAll, vset, viewerPref, 2);
    for (const id of compat) expect(vset.has(id)).toBe(false);
    const cset = new Set([...vset, ...compat]);
    const backup = pickBackupCandidates(gAll, cset, viewerPref, 2);
    for (const id of backup) expect(cset.has(id)).toBe(false);
    expect(new Set([...vset, ...compat, ...backup]).size).toBe(6);
  });

  it("null viewer pref: still assigns 6 deterministically", () => {
    const gAll: GatedCandidateForLayering[] = [];
    for (let i = 0; i < 6; i++) {
      gAll.push(
        c({
          id: `n${i}`,
          createdAt: new Date(2019, 5, i + 1),
          age: 28,
          city: "上海",
          height: 170,
          education: "本科",
          occupation: "工程师",
          relationshipGoal: "认真恋爱",
          firstImageStyleTags: ["x"],
          hasImage: true,
        }),
      );
    }
    const picks = assignLayeredSixUserIds(gAll, null);
    expect(picks).toHaveLength(6);
    expect(new Set(picks.map((p) => p.candidateUserId)).size).toBe(6);
  });

  it("pickBackupCandidates: primary createdAt asc, tie-break preferenceScore desc", () => {
    const pool: GatedCandidateForLayering[] = [
      c({
        id: "b_old",
        createdAt: new Date(2018, 0, 1),
        age: 28,
        city: "北京",
        height: 170,
        education: "硕士",
        occupation: "工程师",
        relationshipGoal: "认真恋爱",
        firstImageStyleTags: [],
        hasImage: true,
      }),
      c({
        id: "b_new",
        createdAt: new Date(2020, 0, 1),
        age: 28,
        city: "上海",
        height: 170,
        education: "本科",
        occupation: "工程师",
        relationshipGoal: "认真恋爱",
        firstImageStyleTags: [],
        hasImage: true,
      }),
    ];
    const pref = {
      ...viewerPref,
      preferredCities: ["上海"],
    };
    const backup = pickBackupCandidates(pool, new Set(), pref, 2);
    expect(backup).toEqual(["b_old", "b_new"]);
  });

  it("visualEnhance stub: rank1–2 order can change vs tag-only when scores tie on tag", () => {
    const prefNoStyle = { ...viewerPref, styleTags: [] as string[] };
    const gAll: GatedCandidateForLayering[] = [
      c({
        id: "earlier",
        createdAt: new Date(2020, 0, 1),
        age: 28,
        city: "上海",
        height: 170,
        education: "本科",
        occupation: "工程师",
        relationshipGoal: "认真恋爱",
        firstImageStyleTags: [],
        hasImage: true,
        firstImageId: "img_earlier",
      }),
      c({
        id: "later",
        createdAt: new Date(2020, 0, 2),
        age: 28,
        city: "上海",
        height: 170,
        education: "本科",
        occupation: "工程师",
        relationshipGoal: "认真恋爱",
        firstImageStyleTags: [],
        hasImage: true,
        firstImageId: "img_later",
      }),
      ...["x3", "x4", "x5", "x6"].map((id, i) =>
        c({
          id,
          createdAt: new Date(2020, 0, 10 + i),
          age: 28,
          city: "上海",
          height: 170,
          education: "本科",
          occupation: "工程师",
          relationshipGoal: "认真恋爱",
          firstImageStyleTags: [],
          hasImage: true,
        }),
      ),
    ];
    const tagOnly = assignLayeredSixUserIds(
      gAll.map((row) => ({ ...row })),
      prefNoStyle,
    );
    gAll[1].visualEnhance = {
      visualTags: ["boost"],
      visualConfidence: 1,
      visualSignalScore: 1,
      visualReason: "test_boost",
    };
    const withBoost = assignLayeredSixUserIds(gAll, prefNoStyle);
    expect(tagOnly.find((p) => p.rankInPool === 1)?.candidateUserId).toBe(
      "earlier",
    );
    expect(withBoost.find((p) => p.rankInPool === 1)?.candidateUserId).toBe(
      "later",
    );
    expect(computeVisualSortScore(gAll[0], prefNoStyle)).toBe(0);
    expect(computeVisualSortScore(gAll[1], prefNoStyle)).toBeGreaterThan(0);
  });

  it("applyPreviewVisualEnhanceStubGAll: invalid payload leaves tag-only scores", async () => {
    class InvalidPayloadStub extends StubPreviewVisualEnhanceClient {
      override async enhance() {
        return {
          image_id: "wrong",
          visual_tags: ["x"],
          visual_confidence: 1,
          visual_signal_score: 1,
          visual_reason: "x",
        };
      }
    }
    const client = new InvalidPayloadStub();
    const gAll: GatedCandidateForLayering[] = [];
    for (let i = 0; i < 6; i++) {
      gAll.push(
        c({
          id: `z${i}`,
          createdAt: new Date(2020, 0, i),
          age: 28,
          city: "上海",
          height: 170,
          education: "本科",
          occupation: "工程师",
          relationshipGoal: "认真恋爱",
          firstImageStyleTags: ["简约"],
          hasImage: true,
        }),
      );
    }
    await applyPreviewVisualEnhanceStubGAll(gAll, client, 2000);
    expect(gAll.every((r) => r.visualEnhance == null)).toBe(true);
    const picks = assignLayeredSixUserIds(gAll, viewerPref);
    expect(picks).toHaveLength(6);
  });

  it("parseVisualEnhancePayload rejects mismatch and non-objects", () => {
    expect(parseVisualEnhancePayload(null, "a")).toBeNull();
    expect(parseVisualEnhancePayload("{}", "a")).toBeNull();
    expect(
      parseVisualEnhancePayload(
        {
          image_id: "a",
          visual_tags: ["t"],
          visual_confidence: 0.5,
          visual_signal_score: 0.5,
          visual_reason: "ok",
        },
        "b",
      ),
    ).toBeNull();
    expect(
      parseVisualEnhancePayload(
        {
          image_id: "a",
          visual_tags: ["t"],
          visual_confidence: 0.5,
          visual_signal_score: 2,
          visual_reason: "ok",
        },
        "a",
      ),
    ).toEqual({
      visualTags: ["t"],
      visualConfidence: 0.5,
      visualSignalScore: 1,
      visualReason: "ok",
    });
  });

  it("StubPreviewVisualEnhanceClient + apply enriches rows", async () => {
    const row = c({
      id: "u1",
      firstImageId: "imgid99",
      age: 28,
      city: "上海",
      height: 170,
      education: "本科",
      occupation: "工程师",
      relationshipGoal: "认真恋爱",
      firstImageStyleTags: [],
      hasImage: true,
    });
    const gAll = [row, ...Array.from({ length: 5 }, (_, i) =>
      c({
        id: `fill${i}`,
        createdAt: new Date(2021, 0, i),
        age: 28,
        city: "上海",
        height: 170,
        education: "本科",
        occupation: "工程师",
        relationshipGoal: "认真恋爱",
        firstImageStyleTags: [],
        hasImage: true,
      }),
    )];
    await applyPreviewVisualEnhanceStubGAll(
      gAll,
      new StubPreviewVisualEnhanceClient(),
      2000,
    );
    expect(row.visualEnhance?.visualConfidence).toBe(0.9);
    expect(typeof row.visualEnhance?.visualSignalScore).toBe("number");
  });

  it("sortGAllByCompatOrder is stable for equal preferenceScore", () => {
    const gAll: GatedCandidateForLayering[] = [
      c({
        id: "later",
        createdAt: new Date(2020, 0, 2),
        age: 28,
        city: "上海",
        height: 170,
        education: "本科",
        occupation: "工程师",
        relationshipGoal: "认真恋爱",
        firstImageStyleTags: [],
        hasImage: true,
      }),
      c({
        id: "earlier",
        createdAt: new Date(2020, 0, 1),
        age: 28,
        city: "上海",
        height: 170,
        education: "本科",
        occupation: "工程师",
        relationshipGoal: "认真恋爱",
        firstImageStyleTags: [],
        hasImage: true,
      }),
    ];
    const sorted = sortGAllByCompatOrder(gAll, null);
    expect(sorted[0].id).toBe("earlier");
    expect(sorted[1].id).toBe("later");
  });
});
