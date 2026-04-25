import type { SimulationHintSnapshotEntry } from "./ai-simulation-v1.types";
import { TRANSCRIPT_LITE_NARRATOR_ROUND } from "./ai-simulation-v1.constants";

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
