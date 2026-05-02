import type { SimulationHintSnapshotEntry } from "./ai-simulation-v1.types";
import { TRANSCRIPT_LITE_NARRATOR_ROUND } from "./ai-simulation-v1.constants";
import {
  AI_SIMULATION_LLM_PAYLOAD_SCHEMA_V2,
  AI_SIMULATION_RRM_SOURCE_VERSION,
  RRM_SCENARIO_APPROACH_INTENSITY,
  RRM_SCENARIO_KEYS_ORDERED,
} from "./ai-simulation-v1-rrm.constants";

/** Legacy v1 — not used for new LLM runs after M0.6-Full; kept for reference and tests. */
export function buildAiSimulationV1SystemPrompt(): string {
  return [
    "You output a single JSON object only. No markdown fences. No prose outside JSON.",
    `Root schemaVersion must be exactly "ai_simulation_llm_payload_v1".`,
    `transcript_lite.schemaVersion must be exactly "transcript_lite_v1".`,
    "transcript_lite.rounds must be an array of length 4.",
    "Each round: round (1-4 in order), speaker viewer|candidate|narrator, text max 120 chars.",
    "intent_tag (each round): ONLY lowercase ASCII snake_case: regex ^[a-z][a-z0-9_]*$, max 32 chars. No Chinese, no hyphens (-), no uppercase letters, no spaces.",
    `At most one round may use speaker "narrator", and if used it MUST be round === ${TRANSCRIPT_LITE_NARRATOR_ROUND}.`,
    "evaluator.risk_tags: array of 0-6 items; each item ONLY lowercase ASCII snake_case matching ^[a-z][a-z0-9_]*$, max 32 chars. No Chinese, no hyphens, no uppercase.",
    "evaluator fields: continue_recommendation explore_more|hold|slow_down;",
    "mitigation_hints 0-3 strings max 80 chars; confidence high|medium|low.",
    "evaluator.simulationRankScore MUST be a JSON number (not a string in quotes), strictly between 0 and 1 inclusive; at most 4 decimal places in value.",
    "Scene (transcript_lite MUST follow): Two adults were matched on a relationship/dating product and are having their FIRST private TEXT chat—not therapy, not a meeting, not a job interview. Each round text is a short, natural messaging-app line: light opener, gentle back-and-forth, small disclosures or preferences, and whether it still feels easy to keep chatting. Early-dating DM tone; not Q&A, not panel interview, not formal assessment.",
    "User JSON fields prescreenBucket, prescreenScore, rankHint, reviewStaticScore, majorFitsCount, majorRisksCount describe RELATIONSHIP-pipeline compatibility signals only. Do NOT reinterpret them as hiring, recruiting, workplace performance, or screening a job applicant.",
    'Speaker "candidate" means the matched OTHER USER (user B), never a job candidate or interviewee. Speaker "viewer" is user A.',
    "Hard ban in every transcript_lite text (and narrator lines): hiring, recruiting, job interview, HR, resume/CV, KPI/OKR, performance review, offer, panel, qualification drill, workplace titles as evaluation targets, or any job-applicant framing.",
    "Do not impersonate real users. This is an internal hypothetical micro-dialogue for relationship-first-message quality reference only—not for employment or ranking people as job candidates.",
  ].join("\n");
}

export function buildAiSimulationV1UserPrompt(params: {
  viewerUserId: string;
  candidateUserId: string;
  hint: SimulationHintSnapshotEntry;
  reviewStaticScore: number;
  majorFitsCount: number;
  majorRisksCount: number;
}): string {
  return JSON.stringify(
    {
      task: "ai_simulation_llm_payload_v1",
      viewerUserId: params.viewerUserId,
      candidateUserId: params.candidateUserId,
      prescreenBucket: params.hint.bucket,
      prescreenScore: params.hint.prescreenScore,
      rankHint: params.hint.rankHint,
      reviewStaticScore: params.reviewStaticScore,
      majorFitsCount: params.majorFitsCount,
      majorRisksCount: params.majorRisksCount,
    },
    null,
    2,
  );
}

export function buildAiSimulationV2SystemPrompt(): string {
  const scenarioLines = RRM_SCENARIO_KEYS_ORDERED.map(
    (k) => `- ${k} (scenarioApproachIntensity MUST be exactly ${RRM_SCENARIO_APPROACH_INTENSITY[k]} — numeric, not a string).`,
  ).join("\n");

  return [
    "You output a single JSON object only. No markdown fences. No prose outside JSON.",
    "Return raw JSON only. Do not wrap in Markdown. Do not include explanations before or after the JSON.",
    `Root schemaVersion MUST be the JSON number ${AI_SIMULATION_LLM_PAYLOAD_SCHEMA_V2} (integer two, not quoted).`,
    "You MUST simulate SEVEN separate, real, relationship-relevant private-text scenarios between the same two matched adults (viewer vs candidate). Each scenario is independent: its own situation, pacing, and simulationTranscript.",
    "scenarioResults MUST be an array of length 7 in the EXACT order below (no extra scenarios, no reordering, no omissions):",
    scenarioLines,
    "Per-scenario intent (keep all low-pressure, respectful; pre-match exploration only):",
    "  1) low_pressure_first_chat — first DM feels natural and easy, not interrogative.",
    "  2) topic_expansion — both extend from interests/daily life without forcing depth.",
    "  3) personal_sharing — light mutual disclosure that builds understanding, not oversharing.",
    "  4) emotional_support_light — one person mentions mild stress/tiredness; the other responds with warmth, not lecturing or pressure.",
    "  5) pace_negotiation — one side is slower or needs space; the other expresses interest without chasing or guilt.",
    "  6) low_pressure_invitation — soft invite with clear room to decline; no hard push.",
    "  7) minor_misunderstanding_repair — small mix-up is clarified and repaired, not escalated or iced out.",
    "Do NOT use the deprecated product-internal \"10 shortlist sceneKey\" matrix as a template or vocabulary source. Do NOT output those legacy scene names. Your scenario field MUST be exactly one of the seven keys above.",
    "Do NOT reuse lines, jokes, or near-duplicate sentences across scenarios; each transcript must be clearly distinct wording.",
    "For EACH scenario:",
    "  - simulationTranscript MUST be an array of JSON objects only (no bare strings, no tuples).",
    '  - Each item MUST be exactly: { \"speaker\": \"viewer\", \"message\": \"...\" } OR { \"speaker\": \"candidate\", \"message\": \"...\" }.',
    "  - Rules: Do NOT use strings like \"viewer: ...\" or \"candidate: ...\". Do NOT use arrays like [\"viewer\", \"...\"]. Do NOT use narrator inside simulationTranscript.",
    "  - speaker can only be the JSON strings \"viewer\" or \"candidate\". message MUST be a JSON string (non-empty after trim), max 160 characters.",
    "  - Each scenarioResult.simulationTranscript MUST contain exactly 8 messages (not 7, not 9, not 8–16 — exactly eight JSON objects in the array).",
    "  - The speaker order MUST alternate exactly as: (1) viewer, (2) candidate, (3) viewer, (4) candidate, (5) viewer, (6) candidate, (7) viewer, (8) candidate.",
    "  - Do not output fewer than 8 messages. Do not output more than 8 messages in any scenario's simulationTranscript.",
    "  - Example (shape only; extend to 8 alternating lines; each scenario must use its own distinct dialogue):",
    '    \"simulationTranscript\": [',
    '      { \"speaker\": \"viewer\", \"message\": \"…\" },',
    '      { \"speaker\": \"candidate\", \"message\": \"…\" },',
    '      { \"speaker\": \"viewer\", \"message\": \"…\" },',
    '      { \"speaker\": \"candidate\", \"message\": \"…\" },',
    '      { \"speaker\": \"viewer\", \"message\": \"…\" },',
    '      { \"speaker\": \"candidate\", \"message\": \"…\" },',
    '      { \"speaker\": \"viewer\", \"message\": \"…\" },',
    '      { \"speaker\": \"candidate\", \"message\": \"…\" }',
    "    ]",
    "  - simulationTranscript (viewer+candidate only): NEVER put narrator or system voice inside simulationTranscript.",
    "  - Each message max 160 characters. Natural early-dating DM tone in Simplified Chinese unless the user JSON requires otherwise.",
    "  - simulationSummary: 1–3 short sentences (Simplified Chinese).",
    "  - Optional observerNotes: one short neutral observation (Simplified Chinese).",
    "  - signals: topicContinuity, emotionalSafety, mutualInvestment, pressureOrBoundaryRisk, nextStepSuitability, conversationMomentum, repairPotential — each a brief Simplified Chinese phrase (<= 240 chars), grounded ONLY in THAT scenario's transcript (not copied from other scenarios).",
    "    nextStepSuitability MUST be exactly one ASCII token: continue_lightly | maintain | soft_progress | slow_down | stop_or_step_back",
    "  - evaluator.scenarioScore and evaluator.confidence: JSON numbers in [0,1], max 4 decimal places.",
    "overallSimulationAssessment MUST synthesize all 7 scenarios: crossScenarioConsistency, mainStrengths (1–8 short strings), mainRisks (1–8), recommendedOpeningStyle (short Chinese), confidence in [0,1].",
    "participants.viewerUserId and participants.candidateUserId MUST match the user JSON exactly.",
    `sourceType: short ASCII (e.g. openai_chat_completions). sourceVersion MUST be exactly \"${AI_SIMULATION_RRM_SOURCE_VERSION}\". fallbackUsed MUST be false.`,
    "Hard bans in ALL messages: manipulation/PUA, coercive pressure, love-bombing, sudden confession, relationship confirmation, strong flirting escalations, sexual boundary probing, jealousy tests, conflict escalation, high-pressure invites, sexual explicitness, insults, threats, harassment, moral guilt-tripping, demanding immediate replies.",
    "Do not impersonate real users. Hypothetical product-internal simulation only.",
    "staticContext describes questionnaire-derived compatibility hints only — not hiring or workplace screening.",
    'Speaker \"candidate\" is the matched other user, never a job applicant.',
  ].join("\n");
}

export function buildAiSimulationV2UserPrompt(params: {
  viewerUserId: string;
  candidateUserId: string;
  hint: SimulationHintSnapshotEntry;
  staticContext: Record<string, unknown>;
}): string {
  return JSON.stringify(
    {
      task: "ai_simulation_llm_payload_v2_rrm_ready",
      instruction:
        "Output exactly 7 scenarioResults in the fixed server order (see system prompt). Each scenario needs its own simulationTranscript of exactly 8 alternating viewer/candidate messages as in the system prompt; do not reuse lines across scenarios. Do not use legacy 10-scene shortlist keys.",
      viewerUserId: params.viewerUserId,
      candidateUserId: params.candidateUserId,
      prescreenBucket: params.hint.bucket,
      prescreenScore: params.hint.prescreenScore,
      rankHint: params.hint.rankHint,
      staticContext: params.staticContext,
    },
    null,
    2,
  );
}
