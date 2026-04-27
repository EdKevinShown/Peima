/**
 * P6.11: read-only human summary of `effectiveProfileChatOverlayV1` for match-explanation-ai
 * prompt context only. No raw JSON to the model; no axisId / branch / weights in text.
 */

const OVERLAY_PROMPT_HEADER = `【聊天画像补充参考】以下段落仅供丰富自然语言说明：这是聊天画像补充参考；不影响匹配分；不改变问卷主画像。撰写 explanationText 时不得声称本节内容改变了匹配分、排序、问卷主结论或系统匹配决策。`;

const STATE_PRIORITY: Record<string, number> = {
  mixed_conflict: 5,
  stable: 4,
  leaning: 3,
  observing: 2,
  baseline_only: 1,
};

type AxisState =
  | "baseline_only"
  | "observing"
  | "leaning"
  | "stable"
  | "mixed_conflict";

type AxisLike = {
  state?: unknown;
  questionnaireBaselineBranch?: unknown;
  leadingBranch?: unknown;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isAxisState(s: unknown): s is AxisState {
  return (
    s === "baseline_only" ||
    s === "observing" ||
    s === "leaning" ||
    s === "stable" ||
    s === "mixed_conflict"
  );
}

function axisSentence(axis: AxisLike): string | null {
  if (!isAxisState(axis.state)) return null;
  switch (axis.state) {
    case "baseline_only":
      return "这一维度暂时没有足够聊天信号，说明以问卷为主。";
    case "observing":
      return "聊天里有一点倾向，但证据还少。";
    case "leaning":
      return "多轮聊天倾向更清楚，但仍以问卷为主。";
    case "stable": {
      const q = axis.questionnaireBaselineBranch;
      const lead = axis.leadingBranch;
      const aligned =
        typeof q === "string" &&
        typeof lead === "string" &&
        q.length > 0 &&
        lead.length > 0 &&
        q === lead;
      if (aligned) {
        return "多轮聊天侧写较稳定；与问卷一致，可视为对问卷基线的强化参考。";
      }
      return "多轮聊天侧写较稳定；说明仍以问卷主画像为准。";
    }
    case "mixed_conflict":
      return "聊天侧写方向不一致，系统不强行合成单一结论，保守以问卷为准。";
    default:
      return null;
  }
}

function priorityForState(state: unknown): number {
  if (!isAxisState(state)) return 0;
  return STATE_PRIORITY[state] ?? 0;
}

/**
 * Returns a short block for the LLM user message, or null when there is nothing useful to add.
 */
export function buildChatProfileOverlaySummaryForPrompt(
  overlayJson: unknown,
): string | null {
  if (overlayJson == null) return null;
  if (!isRecord(overlayJson)) return null;
  const axesRaw = overlayJson.axes;
  if (!isRecord(axesRaw)) return null;

  const axes = Object.values(axesRaw).filter(isRecord) as AxisLike[];
  if (axes.length === 0) return null;

  const sentences: { p: number; text: string }[] = [];
  for (const ax of axes) {
    const t = axisSentence(ax);
    if (!t) continue;
    sentences.push({ p: priorityForState(ax.state), text: t });
  }
  if (sentences.length === 0) return null;

  const allBaseline = sentences.every(
    (s) => s.p <= STATE_PRIORITY.baseline_only,
  );
  if (allBaseline) {
    const one =
      "就当前已汇总的聊天侧写而言，整体上仍缺少足够会话信号，说明以问卷为主。";
    return `${OVERLAY_PROMPT_HEADER}\n- ${one}`;
  }

  const hasNonBaseline = sentences.some(
    (s) => s.p > STATE_PRIORITY.baseline_only,
  );
  const pool = hasNonBaseline
    ? sentences.filter((s) => s.p > STATE_PRIORITY.baseline_only)
    : sentences;

  pool.sort((a, b) => b.p - a.p);
  const top = pool.slice(0, 3);
  const bullets = top.map((s) => `- ${s.text}`).join("\n");
  return `${OVERLAY_PROMPT_HEADER}\n${bullets}`;
}
