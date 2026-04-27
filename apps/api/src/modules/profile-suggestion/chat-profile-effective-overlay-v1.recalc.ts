import {
  buildAxisBranchProfilesV3,
  type AnswerInput,
} from "../questionnaire/questionnaire.scorer";
import { CHAT_PROFILE_EVIDENCE_OVERLAY_SCHEMA_VERSION } from "./chat-profile-evidence-v1.weights";

export type ChatEvidenceAxisStateV1 =
  | "baseline_only"
  | "observing"
  | "leaning"
  | "stable"
  | "mixed_conflict";

export type ChatProfileEvidenceRowInput = {
  conversationId: string;
  axisId: number;
  branch: string;
  evidenceWeight: number;
  acceptedAt: Date;
};

export type EffectiveProfileChatOverlayAxisV1 = {
  state: ChatEvidenceAxisStateV1;
  questionnaireBaselineBranch: string | null;
  finalEffectiveBranch: string | null;
  scoreByBranch: Record<string, number>;
  independentConversationCount: number;
  leadingBranch: string | null;
  secondBranch: string | null;
  /** 便于审计的冲突触发说明（短枚举）。 */
  conflictReasons?: string[];
};

export type EffectiveProfileChatOverlayV1 = {
  schemaVersion: typeof CHAT_PROFILE_EVIDENCE_OVERLAY_SCHEMA_VERSION;
  computedAt: string;
  axes: Record<string, EffectiveProfileChatOverlayAxisV1>;
};

const BRANCHES = ["A", "B", "C", "D", "E"] as const;

function emptyAxis(
  baseline: string | null,
): EffectiveProfileChatOverlayAxisV1 {
  return {
    state: "baseline_only",
    questionnaireBaselineBranch: baseline,
    finalEffectiveBranch: baseline,
    scoreByBranch: {},
    independentConversationCount: 0,
    leadingBranch: null,
    secondBranch: null,
  };
}

function sortBranchesByWeight(
  scoreByBranch: Record<string, number>,
): { branch: string; w: number }[] {
  const rows = BRANCHES.map((b) => ({
    branch: b,
    w: scoreByBranch[b] ?? 0,
  })).filter((r) => r.w > 0);
  rows.sort((a, b) => b.w - a.w);
  return rows;
}

/** 每个会话在该轴上最多一条证据：取 acceptedAt 最新的一条代表该会话方向。 */
function latestEvidencePerConversation(
  rows: ReadonlyArray<ChatProfileEvidenceRowInput>,
): Map<string, ChatProfileEvidenceRowInput> {
  const m = new Map<string, ChatProfileEvidenceRowInput>();
  for (const r of rows) {
    const prev = m.get(r.conversationId);
    if (!prev || r.acceptedAt.getTime() > prev.acceptedAt.getTime()) {
      m.set(r.conversationId, r);
    }
  }
  return m;
}

function recentSessionBranches(
  perConv: Map<string, ChatProfileEvidenceRowInput>,
  n: number,
): string[] {
  const list = [...perConv.values()].sort(
    (a, b) => b.acceptedAt.getTime() - a.acceptedAt.getTime(),
  );
  return list.slice(0, n).map((x) => x.branch);
}

function countConversationsByBranch(
  perConv: Map<string, ChatProfileEvidenceRowInput>,
): Record<string, number> {
  const c: Record<string, number> = {};
  for (const r of perConv.values()) {
    c[r.branch] = (c[r.branch] ?? 0) + 1;
  }
  return c;
}

function detectMixedConflict(params: {
  scoreByBranch: Record<string, number>;
  perConv: Map<string, ChatProfileEvidenceRowInput>;
}): { conflict: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const { scoreByBranch, perConv } = params;
  const sorted = sortBranchesByWeight(scoreByBranch);
  const w1 = sorted[0]?.w ?? 0;
  const w2 = sorted[1]?.w ?? 0;
  const total = BRANCHES.reduce((s, b) => s + (scoreByBranch[b] ?? 0), 0);

  if (total <= 0) {
    return { conflict: false, reasons: [] };
  }

  if (w2 > 0 && w1 / w2 < 1.2) {
    reasons.push("top2_weight_ratio_lt_1_2");
  }

  const convByBranch = countConversationsByBranch(perConv);
  const topBranches = [...Object.entries(convByBranch)].sort(
    (a, b) => b[1] - a[1],
  );
  if (
    topBranches.length >= 2 &&
    topBranches[0][1] >= 2 &&
    topBranches[1][1] >= 2
  ) {
    reasons.push("top2_branches_both_ge_2_sessions");
  }

  const recent = recentSessionBranches(perConv, 3);
  if (recent.length >= 3) {
    const uniq = new Set(recent);
    if (uniq.size > 1) {
      reasons.push("last_3_sessions_branch_mismatch");
    }
  }

  return { conflict: reasons.length > 0, reasons };
}

function computeAxis(
  axisId: number,
  baseline: string | null,
  rows: ReadonlyArray<ChatProfileEvidenceRowInput>,
): EffectiveProfileChatOverlayAxisV1 {
  const axisRows = rows.filter((r) => r.axisId === axisId);
  if (axisRows.length === 0) {
    return emptyAxis(baseline);
  }

  const perConv = latestEvidencePerConversation(axisRows);
  const independentConversationCount = perConv.size;

  const scoreByBranch: Record<string, number> = {};
  for (const b of BRANCHES) scoreByBranch[b] = 0;
  for (const r of axisRows) {
    scoreByBranch[r.branch] =
      (scoreByBranch[r.branch] ?? 0) + r.evidenceWeight;
  }

  const sorted = sortBranchesByWeight(scoreByBranch);
  const leadingBranch = sorted[0]?.branch ?? null;
  const secondBranch = sorted[1]?.branch ?? null;
  const wLead = sorted[0]?.w ?? 0;
  const wSecond = sorted[1]?.w ?? 0;
  const totalW = BRANCHES.reduce((s, b) => s + (scoreByBranch[b] ?? 0), 0);

  const { conflict, reasons } = detectMixedConflict({
    scoreByBranch,
    perConv,
  });

  if (conflict) {
    return {
      state: "mixed_conflict",
      questionnaireBaselineBranch: baseline,
      finalEffectiveBranch: baseline ?? null,
      scoreByBranch,
      independentConversationCount,
      leadingBranch,
      secondBranch,
      conflictReasons: reasons,
    };
  }

  const branchesInPlay = new Set(
    [...perConv.values()].map((r) => r.branch),
  );
  const singleDirection =
    branchesInPlay.size === 1 ? [...branchesInPlay][0]! : null;

  const hasQ = baseline != null;

  if (!hasQ) {
    if (
      independentConversationCount >= 2 &&
      !singleDirection
    ) {
      return {
        state: "mixed_conflict",
        questionnaireBaselineBranch: null,
        finalEffectiveBranch: null,
        scoreByBranch,
        independentConversationCount,
        leadingBranch,
        secondBranch,
        conflictReasons: ["multi_branch_without_questionnaire_baseline"],
      };
    }
    if (independentConversationCount === 1) {
      return {
        state: "observing",
        questionnaireBaselineBranch: null,
        finalEffectiveBranch: null,
        scoreByBranch,
        independentConversationCount,
        leadingBranch,
        secondBranch,
      };
    }
    if (
      independentConversationCount === 2 &&
      singleDirection &&
      singleDirection === leadingBranch
    ) {
      return {
        state: "leaning",
        questionnaireBaselineBranch: null,
        finalEffectiveBranch: leadingBranch,
        scoreByBranch,
        independentConversationCount,
        leadingBranch,
        secondBranch,
      };
    }
    if (
      independentConversationCount >= 3 &&
      singleDirection &&
      singleDirection === leadingBranch
    ) {
      return {
        state: "stable",
        questionnaireBaselineBranch: null,
        finalEffectiveBranch: leadingBranch,
        scoreByBranch,
        independentConversationCount,
        leadingBranch,
        secondBranch,
      };
    }
    return {
      state: "mixed_conflict",
      questionnaireBaselineBranch: null,
      finalEffectiveBranch: null,
      scoreByBranch,
      independentConversationCount,
      leadingBranch,
      secondBranch,
      conflictReasons: ["no_q_baseline_unresolved_branch_pattern"],
    };
  }

  // 有问卷基线，且本轴已有聊天证据（axisRows 非空 ⇒ independentConversationCount >= 1）

  if (independentConversationCount === 1) {
    return {
      state: "observing",
      questionnaireBaselineBranch: baseline,
      finalEffectiveBranch: baseline,
      scoreByBranch,
      independentConversationCount,
      leadingBranch,
      secondBranch,
    };
  }

  if (independentConversationCount === 2) {
    if (singleDirection) {
      return {
        state: "leaning",
        questionnaireBaselineBranch: baseline,
        finalEffectiveBranch: baseline,
        scoreByBranch,
        independentConversationCount,
        leadingBranch,
        secondBranch,
      };
    }
    return {
      state: "mixed_conflict",
      questionnaireBaselineBranch: baseline,
      finalEffectiveBranch: baseline,
      scoreByBranch,
      independentConversationCount,
      leadingBranch,
      secondBranch,
      conflictReasons: ["two_sessions_different_branch"],
    };
  }

  // >= 3 独立会话
  if (!singleDirection || !leadingBranch) {
    return {
      state: "mixed_conflict",
      questionnaireBaselineBranch: baseline,
      finalEffectiveBranch: baseline,
      scoreByBranch,
      independentConversationCount,
      leadingBranch,
      secondBranch,
      conflictReasons: ["three_plus_sessions_branch_inconsistent"],
    };
  }

  /** 聊天与问卷同向：≥3 独立会话一致 → stable（语义为聊天强化问卷基线，非 baseline_only）。 */
  if (leadingBranch === baseline) {
    return {
      state: "stable",
      questionnaireBaselineBranch: baseline,
      finalEffectiveBranch: baseline,
      scoreByBranch,
      independentConversationCount,
      leadingBranch,
      secondBranch,
    };
  }

  const share = totalW > 0 ? wLead / totalW : 0;
  const leadRatio = wSecond > 0 ? wLead / wSecond : Infinity;
  const canOverride =
    singleDirection === leadingBranch &&
    share >= 0.65 &&
    leadRatio >= 1.2;

  if (canOverride) {
    return {
      state: "stable",
      questionnaireBaselineBranch: baseline,
      finalEffectiveBranch: leadingBranch,
      scoreByBranch,
      independentConversationCount,
      leadingBranch,
      secondBranch,
    };
  }

  return {
    state: "leaning",
    questionnaireBaselineBranch: baseline,
    finalEffectiveBranch: baseline,
    scoreByBranch,
    independentConversationCount,
    leadingBranch,
    secondBranch,
  };
}

export function buildQuestionnaireBaselinesDominantOnly(
  answers: ReadonlyArray<AnswerInput>,
): Record<number, string | null> {
  const layer = buildAxisBranchProfilesV3(answers, undefined);
  const out: Record<number, string | null> = {};
  for (let a = 1; a <= 20; a += 1) {
    out[a] = layer[a]?.dominantBranch ?? null;
  }
  return out;
}

export function recalcEffectiveProfileChatOverlayV1(params: {
  answers: ReadonlyArray<AnswerInput>;
  evidences: ReadonlyArray<ChatProfileEvidenceRowInput>;
  computedAt: Date;
}): EffectiveProfileChatOverlayV1 {
  const baselines = buildQuestionnaireBaselinesDominantOnly(params.answers);
  const axes: Record<string, EffectiveProfileChatOverlayAxisV1> = {};
  for (let axisId = 1; axisId <= 20; axisId += 1) {
    axes[String(axisId)] = computeAxis(
      axisId,
      baselines[axisId] ?? null,
      params.evidences,
    );
  }
  return {
    schemaVersion: CHAT_PROFILE_EVIDENCE_OVERLAY_SCHEMA_VERSION,
    computedAt: params.computedAt.toISOString(),
    axes,
  };
}
