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

export type SubmitQuestionnaireResponse = {
  userId: string;
  answersSaved: number;
  profile: Record<string, unknown>;
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
