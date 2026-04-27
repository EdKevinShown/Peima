import type { MatchResult } from "@peima/database";
import { buildChatProfileOverlaySummaryForPrompt } from "../src/modules/match-explanation-ai/match-explanation-chat-overlay-summary";
import { buildMatchExplanationUserContent } from "../src/modules/match-explanation-ai/match-explanation-ai-model.prompt";

function minimalMatchRow(overrides: Partial<MatchResult> = {}): MatchResult {
  return {
    id: "mr-test",
    userId: "u-viewer",
    candidateUserId: "u-cand",
    batchId: "b1",
    finalScore: 72,
    status: "final",
    reasonSummary: "rs",
    matchInsights: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  } as MatchResult;
}

describe("buildChatProfileOverlaySummaryForPrompt (P6.11)", () => {
  it("returns null for null / non-object / missing axes", () => {
    expect(buildChatProfileOverlaySummaryForPrompt(null)).toBeNull();
    expect(buildChatProfileOverlaySummaryForPrompt(undefined)).toBeNull();
    expect(buildChatProfileOverlaySummaryForPrompt("x")).toBeNull();
    expect(buildChatProfileOverlaySummaryForPrompt({})).toBeNull();
    expect(buildChatProfileOverlaySummaryForPrompt({ axes: [] })).toBeNull();
  });

  it("includes disclaimer and mixed_conflict wording when overlay has signal", () => {
    const block = buildChatProfileOverlaySummaryForPrompt({
      schemaVersion: 1,
      computedAt: "2026-01-01T00:00:00.000Z",
      axes: {
        axis_hidden_from_output: {
          state: "mixed_conflict",
          questionnaireBaselineBranch: "A",
          finalEffectiveBranch: "A",
          scoreByBranch: { A: 1, B: 1 },
          independentConversationCount: 2,
          leadingBranch: "A",
          secondBranch: "B",
          conflictReasons: ["x"],
        },
      },
    });
    expect(block).not.toBeNull();
    expect(block).toContain("聊天画像补充参考");
    expect(block).toContain("不影响匹配分");
    expect(block).toContain("不改变问卷主画像");
    expect(block).toContain("聊天侧写方向不一致");
    expect(block).not.toMatch(/axis_hidden/i);
    expect(block).not.toMatch(/\bA\b/);
    expect(block).not.toMatch(/\bB\b/);
    expect(block).not.toContain("conflictReasons");
  });

  it("uses reinforcement phrasing for stable when chat aligns questionnaire", () => {
    const block = buildChatProfileOverlaySummaryForPrompt({
      schemaVersion: 1,
      computedAt: "2026-01-01T00:00:00.000Z",
      axes: {
        k1: {
          state: "stable",
          questionnaireBaselineBranch: "C",
          finalEffectiveBranch: "C",
          leadingBranch: "C",
          secondBranch: null,
          scoreByBranch: {},
          independentConversationCount: 3,
        },
      },
    });
    expect(block).toContain("强化参考");
    expect(block).not.toMatch(/\bC\b/);
  });

  it("collapses all-baseline axes to one short line", () => {
    const block = buildChatProfileOverlaySummaryForPrompt({
      schemaVersion: 1,
      computedAt: "2026-01-01T00:00:00.000Z",
      axes: {
        a: {
          state: "baseline_only",
          questionnaireBaselineBranch: "A",
          finalEffectiveBranch: "A",
          scoreByBranch: {},
          independentConversationCount: 0,
          leadingBranch: null,
          secondBranch: null,
        },
        b: {
          state: "baseline_only",
          questionnaireBaselineBranch: "B",
          finalEffectiveBranch: "B",
          scoreByBranch: {},
          independentConversationCount: 0,
          leadingBranch: null,
          secondBranch: null,
        },
      },
    });
    expect(block).toContain("聊天画像补充参考");
    expect(block).toContain("说明以问卷为主");
    expect(block!.split("\n- ").length).toBeLessThanOrEqual(2);
  });
});

describe("buildMatchExplanationUserContent with overlay (P6.11)", () => {
  const row = minimalMatchRow();

  it("does not append overlay block when summary is null or empty", () => {
    const a = buildMatchExplanationUserContent(row);
    const b = buildMatchExplanationUserContent(row, {
      chatProfileOverlaySummary: null,
    });
    const c = buildMatchExplanationUserContent(row, {
      chatProfileOverlaySummary: "   ",
    });
    expect(a).toBe(b);
    expect(a).toBe(c);
    expect(a).not.toContain("聊天画像补充参考");
  });

  it("appends overlay block when summary is non-empty", () => {
    const summary =
      buildChatProfileOverlaySummaryForPrompt({
        schemaVersion: 1,
        computedAt: "2026-01-01T00:00:00.000Z",
        axes: {
          x: { state: "observing" },
        },
      }) ?? "";
    const u = buildMatchExplanationUserContent(row, {
      chatProfileOverlaySummary: summary,
    });
    expect(u.startsWith(`matchResultId=${row.id}`)).toBe(true);
    expect(u).toContain("聊天画像补充参考");
    expect(u).toContain("matchInsights");
  });
});
