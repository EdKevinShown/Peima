/**
 * M4.3-M1: pure helpers for Final Match user-facing copy (no API changes).
 */

/** One-line hero conclusion: readout headline, else first line of whyMatch, else generic. */
export function pickHeroConclusion(readoutFusion, matchInsights) {
  const h = readoutFusion?.headlineZh?.trim();
  if (h) return h;
  const w = matchInsights?.explanation?.whyMatch;
  if (typeof w === "string" && w.trim()) {
    const t = w.trim();
    const line = t.split(/\n+/)[0]?.trim() || t;
    return line.length > 160 ? `${line.slice(0, 157)}…` : line;
  }
  return "系统已综合你的问卷与偏好，为本轮匹配给出以下说明，便于你带着更轻松的心态开始接触。";
}

/** M5.5-UI-R1: fixed hero intro (no competing readout headline in hero). */
export function pickHeroMainIntro(displaySourceType) {
  if (displaySourceType === "rrm_top2_bounded_selector") {
    return "系统先筛出高适配候选，再结合关系节奏与推进安全感，为你推荐当前对象。";
  }
  return "系统根据基础资料、问卷画像与候选池排序，为你推荐当前对象。";
}

function clampOneTwoSentences(s, maxLen = 130) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}…`;
}

/** M5.5-UI-R1: up to 3 user-facing “why recommend” lines (no internal score tokens). */
export function pickWhyRecommendLines(insights, displaySourceType) {
  const strengths = Array.isArray(insights?.explanation?.strengths) ? insights.explanation.strengths : [];
  const lines = [];
  const looksInternal = (u) =>
    /\b(preview|preference|profileScore|style)\s*=/i.test(u) || /\bprofileScore\b/i.test(u);
  for (const s of strengths) {
    if (typeof s === "string" && s.trim()) {
      const u = s.trim();
      if (!looksInternal(u)) {
        lines.push(clampOneTwoSentences(u, 100));
      }
      if (lines.length >= 2) break;
    }
  }
  if (lines.length === 0) lines.push("基础适配较高，双方资料与问卷维度整体较为协调。");
  if (lines.length === 1) lines.push("问卷画像与主要偏好方向较为接近。");
  if (displaySourceType === "rrm_top2_bounded_selector") {
    lines.push("关系节奏较合适，相处与推进安全感更契合当前展示对象。");
  } else {
    lines.push("可按下方建议，从轻松话题逐步深入了解。");
  }
  return lines.slice(0, 3);
}

/** M5.5-UI-R1: three short coexistence paragraphs (insights + optional review). */
export function buildCoexistenceSegments(insights, matchReview) {
  const rhythmRaw = insights?.explanation?.rhythmPrediction;
  const rhythm =
    typeof rhythmRaw === "string" && rhythmRaw.trim()
      ? clampOneTwoSentences(rhythmRaw, 140)
      : "先从轻松话题开始，观察彼此回应是否自然，再逐步深入。";

  const cautions = Array.isArray(insights?.explanation?.cautions) ? insights.explanation.cautions : [];
  const firstC = cautions.find((c) => typeof c === "string" && c.trim());
  const caution =
    typeof firstC === "string" && firstC.trim()
      ? clampOneTwoSentences(firstC.trim(), 140)
      : "若节奏感不同，不必过早下结论，可以多几次互动再判断。";

  let chat =
    typeof insights?.chatSimulationSummary === "string" && insights.chatSimulationSummary.trim()
      ? clampOneTwoSentences(insights.chatSimulationSummary.trim(), 140)
      : "建议用具体、生活化的问题开场，避免一开始就进入压力较大的关系讨论。";

  const ex = matchReview?.aiReview?.explanation;
  if (typeof ex === "string" && ex.trim()) {
    const add = clampOneTwoSentences(ex.trim(), 90);
    chat = `${chat} ${add}`.trim();
    chat = clampOneTwoSentences(chat, 200);
  }

  return { rhythm, caution, chat };
}

/** Derive 2–3 friendly tips from interaction lite result (no axis jargon in main path). */
export function pickFirstChatFriendlyTips(interactionSim) {
  if (!interactionSim?.overall) return [];
  const out = [];
  const v = interactionSim.overall.verdict;
  const sum = typeof interactionSim.overall.summary === "string" ? interactionSim.overall.summary.trim() : "";
  if (sum) out.push(clampOneTwoSentences(sum, 120));
  if (v === "worth_exploring") out.push("若对方回应积极，可以自然延展到兴趣与相处节奏。");
  else if (v === "cautious") out.push("建议放慢节奏，用几次互动感受彼此是否同频。");
  else out.push("开场尽量轻松，避免过早讨论高压力承诺类话题。");
  return out.slice(0, 3);
}

/** Dedupe readout bullets vs whyMatch / strengths (substring containment). */
export function pickDistinctFusionBullets(readoutFusion, whyMatchText, strengths) {
  const bullets = Array.isArray(readoutFusion?.bulletsZh) ? readoutFusion.bulletsZh : [];
  const pool = [];
  if (typeof whyMatchText === "string") pool.push(whyMatchText.trim().toLowerCase());
  for (const s of strengths || []) {
    if (typeof s === "string" && s.trim()) pool.push(s.trim().toLowerCase());
  }
  const out = [];
  for (const b of bullets) {
    if (typeof b !== "string" || !b.trim()) continue;
    const t = b.trim();
    const low = t.toLowerCase();
    const dup = pool.some((p) => p && (low === p || low.includes(p) || p.includes(low)));
    if (dup) continue;
    out.push(t);
    if (out.length >= 4) break;
  }
  return out;
}

/** riskFlags → short user-facing lines (no raw dump as primary UI). */
export function humanizeRiskFlags(riskFlags) {
  if (!Array.isArray(riskFlags)) return [];
  return riskFlags
    .filter((x) => typeof x === "string" && x.trim())
    .map((x) => x.trim())
    .slice(0, 8)
    .map((x) => `参考提示：${x}`);
}

/** Gentle copy for finalize meta fallbackReason (no "AI unreliable" framing). */
export function mapFallbackReasonHint(fallbackReason) {
  if (fallbackReason === "low_decision_confidence") {
    return "系统建议先以轻松交流开始，后续根据互动再判断节奏。";
  }
  if (fallbackReason && typeof fallbackReason === "string" && fallbackReason.trim()) {
    return "本轮匹配参考信号有限，建议把下面的内容当作相处提示，真实感受仍以线下互动为准。";
  }
  return null;
}
