/**
 * M5.5-UI-R3: user-facing copy without internal jargon, ellipsis truncation, or half-sentences on the main path.
 */

/** Substrings that must never appear in user-primary UI (case-insensitive where noted). */
const BANNED_MAIN_UI = [
  "规则占位",
  "非大模型",
  "reviewStaticScore",
  "confidence",
  "canonical",
  "worker",
  "主展示标签",
  "已落库",
  "问卷完成度",
  "心理诊断",
  "画像层面接近度",
  "与系统最终匹配",
  "预览池",
  "基础分",
  "硬性偏好",
  "fallback",
  "sourceVersion",
  "candidateUserId",
  "displayCandidateUserId",
  "rrm_top2_bounded_selector",
  "bounded selector",
  "baseline",
  "另一个候选人",
  "原始候选人",
  "static score",
  "静态复审分",
  "静态复审",
  "画像摘要",
  "RRM",
  "Top2",
  "top2",
  "profileScore",
  "preference=",
  "preview=",
  "分支规则",
  "用于辅助理解",
];

const ELLIPSIS_RE = /(?:\.{2,}|…)/;

export function hasEllipsis(s) {
  return typeof s === "string" && ELLIPSIS_RE.test(s);
}

export function containsBannedMainUiTerms(s) {
  if (typeof s !== "string" || !s.trim()) return false;
  const low = s.toLowerCase();
  for (const term of BANNED_MAIN_UI) {
    if (/[a-zA-Z]/.test(term)) {
      if (low.includes(String(term).toLowerCase())) return true;
    } else if (s.includes(term)) return true;
  }
  if (/\bworker\b/i.test(s)) return true;
  if (/\bfallback\b/i.test(s)) return true;
  if (/\bcanonical\b/i.test(s)) return true;
  if (/\bconfidence\b/i.test(s)) return true;
  return false;
}

/** True if string is safe to show verbatim on the main path (complete thought, no jargon, no ellipsis). */
export function isPlainUserFacingText(s) {
  if (typeof s !== "string") return false;
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length < 4 || t.length > 220) return false;
  if (hasEllipsis(t)) return false;
  if (containsBannedMainUiTerms(t)) return false;
  return true;
}

/** First full sentence ending with 。！？; rejects if not plain-safe. */
export function firstCompletePlainSentence(s) {
  if (typeof s !== "string" || !s.trim()) return "";
  const t = s.replace(/\s+/g, " ").trim();
  const parts = t.split(/(?<=[。！？])/);
  for (const p of parts) {
    const seg = p.trim();
    if (!seg) continue;
    if (!/[。！？]$/.test(seg)) continue;
    if (isPlainUserFacingText(seg)) return seg;
  }
  if (isPlainUserFacingText(t) && t.length <= 220) return t;
  return "";
}

export function plainWhyBullets(isRrm) {
  if (isRrm) {
    return [
      "你们的基础适配度不错。",
      "系统也参考了相处节奏，认为当前对象更适合作为本轮推荐。",
      "建议先轻松聊几次，再判断是否继续深入。",
    ];
  }
  return [
    "你们的基础条件比较匹配。",
    "问卷里的相处偏好有不少接近的地方。",
    "可以先从轻松话题开始，慢慢确认真实相处感。",
  ];
}

const DEFAULT_COEXISTENCE = {
  rhythm: "先从日常生活、兴趣和近期状态聊起，不要一开始就进入太沉重的话题。",
  caution: "你们可能需要一点时间确认真实相处感，不建议只根据第一轮聊天就过早下结论。",
  chat: "可以多问具体、轻松的问题，比如周末安排、最近开心的事、平时喜欢的生活节奏。",
};

export function buildPlainCoexistence(insights, matchReview) {
  let rhythm = DEFAULT_COEXISTENCE.rhythm;
  let caution = DEFAULT_COEXISTENCE.caution;
  let chat = DEFAULT_COEXISTENCE.chat;

  const rhythmRaw = insights?.explanation?.rhythmPrediction;
  const rhythmFrom = typeof rhythmRaw === "string" ? firstCompletePlainSentence(rhythmRaw) : "";
  if (rhythmFrom) rhythm = rhythmFrom;

  const cautions = Array.isArray(insights?.explanation?.cautions) ? insights.explanation.cautions : [];
  for (const c of cautions) {
    if (typeof c !== "string") continue;
    const one = firstCompletePlainSentence(c.trim());
    if (one) {
      caution = one;
      break;
    }
  }

  const chatRaw = typeof insights?.chatSimulationSummary === "string" ? insights.chatSimulationSummary : "";
  const chatFrom = firstCompletePlainSentence(chatRaw);
  if (chatFrom) chat = chatFrom;

  const ex = matchReview?.aiReview?.explanation;
  if (typeof ex === "string") {
    const one = firstCompletePlainSentence(ex.trim());
    if (one && chat === DEFAULT_COEXISTENCE.chat) {
      chat = one;
    }
  }

  return { rhythm, caution, chat };
}

export function reviewStaticScoreBand(score) {
  if (typeof score !== "number" || Number.isNaN(score)) return "";
  if (score >= 78) return "较高";
  if (score >= 60) return "中等";
  return "一般";
}

const CHAT_FALLBACK_BULLETS = [
  "可以先聊轻松生活话题，降低开场压力。",
  "如果对方回应积极，再聊兴趣、生活节奏或近期状态。",
  "暂时不用急着聊很重的关系话题。",
  "如果聊天节奏不一致，可以先放慢一点，多观察几次互动。",
];

function ensurePeriod(s) {
  const t = String(s).trim();
  if (!t) return "";
  if (/[。！？]$/.test(t)) return t;
  return `${t}。`;
}

function bulletsFromOpeningTopics(topics) {
  const out = [];
  const arr = Array.isArray(topics) ? topics : [];
  for (const raw of arr) {
    if (typeof raw !== "string") continue;
    const t = raw.trim();
    if (!t || containsBannedMainUiTerms(t) || hasEllipsis(t)) continue;
    out.push(ensurePeriod(`可以试试从「${t}」这种相对具体的话题开场，聊起来更轻松`));
    if (out.length >= 2) break;
  }
  return out;
}

function verdictTemplateBullets(verdict) {
  if (verdict === "worth_exploring") {
    return [
      "从聊天预判来看，开场更适合保持轻松，先感受彼此回应是否自然。",
      "如果对方接话比较积极，可以再慢慢聊到兴趣和生活节奏。",
    ];
  }
  if (verdict === "cautious") {
    return [
      "从聊天预判来看，开场更适合放慢一点，话题由浅到深更稳妥。",
      "你可以多给对方一些回应空间，用几次互动判断是否同频。",
    ];
  }
  if (verdict === "pause") {
    return [
      "从聊天预判来看，开场更适合尽量轻松，先以相互了解为主。",
      "不必急着聊很重的关系承诺类话题，避免一开始就带来压力。",
    ];
  }
  return [];
}

/**
 * 2–4 plain bullets for「初次聊天预判」: never surfaces API summary if it contains jargon or ellipsis.
 */
export function buildPlainChatPredictionBullets(interactionSim, openingTopics) {
  const fromTopics = bulletsFromOpeningTopics(openingTopics);
  const verdict = interactionSim?.overall?.verdict;
  const summary = typeof interactionSim?.overall?.summary === "string" ? interactionSim.overall.summary.trim() : "";

  const out = [];
  const maybeSummary =
    summary && !hasEllipsis(summary) && !containsBannedMainUiTerms(summary) && summary.length <= 200
      ? ensurePeriod(summary)
      : "";

  if (maybeSummary && isPlainUserFacingText(maybeSummary)) {
    out.push(maybeSummary);
  }

  for (const b of verdictTemplateBullets(verdict)) {
    if (out.length >= 4) break;
    out.push(b);
  }
  for (const b of fromTopics) {
    if (out.length >= 4) break;
    if (!out.some((x) => x.slice(0, 20) === b.slice(0, 20))) out.push(b);
  }
  for (const b of CHAT_FALLBACK_BULLETS) {
    if (out.length >= 4) break;
    if (!out.includes(b)) out.push(b);
  }

  if (out.length < 2) {
    return CHAT_FALLBACK_BULLETS.slice(0, 4);
  }
  return out.slice(0, 4);
}
