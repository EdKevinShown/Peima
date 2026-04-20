import { authHeaders } from "./auth";

const baseUrl =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:3000";

async function handleJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("未登录或 token 无效，请先登录（/login）");
    }
    let detail = text;
    try {
      const body = JSON.parse(text) as { message?: string | string[] };
      if (Array.isArray(body.message)) {
        detail = body.message.join(", ");
      } else if (body.message) {
        detail = String(body.message);
      }
    } catch {
      /* use raw text */
    }
    throw new Error(detail || `HTTP ${res.status}`);
  }
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export type QuestionnaireOption = {
  value: string;
  label: string;
};

export type QuestionnaireQuestion = {
  key: string;
  title: string;
  options: QuestionnaireOption[];
};

export type QuestionnaireQuestionsResponse = {
  version: string;
  questions: QuestionnaireQuestion[];
};

export type SubmitQuestionnairePayload = {
  userId: string;
  answers: { questionKey: string; answerValue: string }[];
};

/** 与 API `UserProfile`（G1-R v2 + 并存旧五维）JSON 对齐。 */
export type QuestionnaireUserProfile = {
  id: string;
  userId: string;
  attachmentStyle: number | null;
  emotionalExpression: number | null;
  communicationStyle: number | null;
  conflictHandling: number | null;
  loveLanguage: number | null;
  securityNeed: number | null;
  controlNeed: number | null;
  independence: number | null;
  loyaltyView: number | null;
  jealousyTendency: number | null;
  moneyAttitude: number | null;
  careerPriority: number | null;
  lifePace: number | null;
  socialNeed: number | null;
  emotionalStability: number | null;
  sexualValues: number | null;
  familyView: number | null;
  marriageExpectation: number | null;
  childrenIntent: number | null;
  riskPreference: number | null;
  confidence: number | null;
  socialEnergy: number | null;
  relationshipPace: number | null;
  initiativeLevel: number | null;
  decisionOrientation: number | null;
  conflictResponse: number | null;
  createdAt: string;
  updatedAt: string;
};

export type SubmitQuestionnaireResponse = {
  userId: string;
  answersSaved: number;
  profile: QuestionnaireUserProfile;
};

export type MatchedAxis = { axisId: number; branch: string };

export type PersonalityLabelPrimary = {
  id: string;
  name: string;
  ruleTokens: string[];
  matchedAxes: MatchedAxis[];
};

export type PersonalityLabelCandidate = PersonalityLabelPrimary & {
  matchRatio: number;
  matchedCount: number;
  requiredCount: number;
};

export type PersonalityStyleLabel = {
  id: string;
  name: string;
  ruleTokens: string[];
  matchedAxes: MatchedAxis[];
};

export type PersonalityLabelsResult = {
  primary: PersonalityLabelPrimary | null;
  candidates: PersonalityLabelCandidate[];
  styleLabels: PersonalityStyleLabel[];
};

export type BranchMetricV3 = {
  hits: number;
  opportunities: number;
  rate: number | null;
  adjustedScore: number | null;
};

export type AxisBranchProfileV3Json = {
  branches: Record<string, BranchMetricV3>;
  dominantBranch: string | null;
  uncertainBranches: string[];
};

/** GET /questionnaire/profile/:userId 完整载荷（v3 分支画像 + 标签）。 */
export type QuestionnaireProfileResponse = {
  profile: QuestionnaireUserProfile;
  dimensionBranchProfiles: Record<string, AxisBranchProfileV3Json>;
  byDimensionBranchScores: Record<string, Record<string, number>>;
  dominantBranches: Record<string, string | null>;
  uncertainBranchesByAxis: Record<string, string[]>;
  labels: PersonalityLabelsResult;
};

export async function getQuestionnaireQuestions() {
  const res = await fetch(`${baseUrl}/questionnaire/questions`);
  return handleJson<QuestionnaireQuestionsResponse>(res);
}

export async function submitQuestionnaire(
  payload: SubmitQuestionnairePayload,
) {
  const res = await fetch(`${baseUrl}/questionnaire/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(payload),
  });
  return handleJson<SubmitQuestionnaireResponse>(res);
}

/** GET /questionnaire/profile/:userId；无画像行时后端 404，此处返回 null。 */
export async function getQuestionnaireProfile(
  userId: string,
): Promise<QuestionnaireProfileResponse | null> {
  const res = await fetch(
    `${baseUrl}/questionnaire/profile/${encodeURIComponent(userId)}`,
    { headers: authHeaders() },
  );
  if (res.status === 404) {
    return null;
  }
  return handleJson<QuestionnaireProfileResponse>(res);
}
