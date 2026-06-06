import type { APIRequestContext } from "@playwright/test";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");

export const API_BASE = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:3000";

export type E2eUser = {
  phone: string;
  userId: string;
  token: string;
  nickname: string;
};

/** CN mobile: 139 + 8 digits — unique per run, avoids polluting real accounts. */
export function uniqueE2ePhone(): string {
  const tail = String(Date.now()).slice(-8);
  return `139${tail}`.slice(0, 11);
}

export async function registerE2eUser(
  request: APIRequestContext,
  nicknamePrefix = "E2E",
): Promise<E2eUser> {
  const phone = uniqueE2ePhone();
  const nickname = `${nicknamePrefix}-${phone.slice(-4)}`;
  const res = await request.post(`${API_BASE}/auth/register`, {
    data: { phone, nickname },
  });
  if (!res.ok()) {
    throw new Error(`register failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as {
    token: string;
    user: { id: string; nickname: string };
  };
  const userId = body.user.id;
  const token = body.token;

  const patch = await request.patch(`${API_BASE}/users/${userId}`, {
    headers: authHeaders(token),
    data: { gender: "male" },
  });
  if (!patch.ok()) {
    throw new Error(`patch gender failed: ${patch.status()} ${await patch.text()}`);
  }

  return { phone, userId, token, nickname };
}

export function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function seedSessionStorage(
  page: import("@playwright/test").Page,
  user: E2eUser,
): Promise<void> {
  await page.goto("/");
  await page.evaluate(
    ({ token, userId, nickname }) => {
      localStorage.setItem("peimaToken", token);
      localStorage.setItem("peimaUserId", userId);
      localStorage.setItem("peimaUserNickname", nickname);
    },
    { token: user.token, userId: user.userId, nickname: user.nickname },
  );
}

export function samplePhotoPath(): string {
  return resolve(REPO_ROOT, "dev-assets/test-user-images/test-user-images1.jpg");
}

export async function submitQuestionnaireViaApi(
  request: APIRequestContext,
  user: E2eUser,
): Promise<void> {
  const qRes = await request.get(`${API_BASE}/questionnaire/questions`, {
    headers: authHeaders(user.token),
  });
  if (!qRes.ok()) {
    throw new Error(`questions failed: ${qRes.status()} ${await qRes.text()}`);
  }
  const { questions } = (await qRes.json()) as {
    questions: Array<{ key: string; options?: Array<{ value: string }> }>;
  };
  const answers = questions.map((q) => ({
    questionKey: q.key,
    answerValue: q.options?.[0]?.value ?? "A",
  }));
  const sub = await request.post(`${API_BASE}/questionnaire/submit`, {
    headers: authHeaders(user.token),
    data: { userId: user.userId, answers },
  });
  if (!sub.ok()) {
    throw new Error(`submit failed: ${sub.status()} ${await sub.text()}`);
  }
}

export async function getTestMatchingCapabilities(
  request: APIRequestContext,
  token: string,
): Promise<{ testBatchMatchTrigger: boolean; testPreviewPoolSeed: boolean }> {
  const res = await request.get(`${API_BASE}/test/matching/capabilities`, {
    headers: authHeaders(token),
  });
  if (!res.ok()) {
    return { testBatchMatchTrigger: false, testPreviewPoolSeed: false };
  }
  return (await res.json()) as {
    testBatchMatchTrigger: boolean;
    testPreviewPoolSeed: boolean;
  };
}

export async function pollMatchingReady(
  request: APIRequestContext,
  user: E2eUser,
  timeoutMs = 120_000,
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const res = await request.get(`${API_BASE}/matching/status/${user.userId}`, {
      headers: authHeaders(user.token),
    });
    if (res.ok()) {
      const body = (await res.json()) as { status?: string };
      if (body.status === "ready") return;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`matching status not ready within ${timeoutMs}ms`);
}

export async function prepareFinalMatchViaApi(
  request: APIRequestContext,
  user: E2eUser,
): Promise<void> {
  const caps = await getTestMatchingCapabilities(request, user.token);
  if (!caps.testPreviewPoolSeed || !caps.testBatchMatchTrigger) {
    throw new Error(
      "test match/seed not enabled for this user — set PEIMA_TEST_* allowlists in .env",
    );
  }

  await submitQuestionnaireViaApi(request, user);

  const seed = await request.post(`${API_BASE}/test/preview-pool/seed-latest`, {
    headers: authHeaders(user.token),
  });
  if (!seed.ok()) {
    throw new Error(`seed preview pool failed: ${seed.status()} ${await seed.text()}`);
  }

  const enq = await request.post(`${API_BASE}/matching/enqueue`, {
    headers: authHeaders(user.token),
    data: { userId: user.userId },
  });
  if (!enq.ok()) {
    throw new Error(`enqueue failed: ${enq.status()} ${await enq.text()}`);
  }

  const batch = await request.post(`${API_BASE}/test/matching/run-batch-once`, {
    headers: authHeaders(user.token),
  });
  if (!batch.ok()) {
    throw new Error(`run-batch-once failed: ${batch.status()} ${await batch.text()}`);
  }

  await pollMatchingReady(request, user);
}

/** Read mapping.json to document demo-candidate prerequisite (no throw). */
export function readDemoCandidateMappingNote(): string {
  try {
    const raw = readFileSync(
      resolve(REPO_ROOT, "dev-assets/test-user-images/mapping.json"),
      "utf8",
    );
    const parsed = JSON.parse(raw) as { items?: unknown[] };
    return `demo candidates in mapping: ${parsed.items?.length ?? 0}`;
  } catch {
    return "mapping.json unreadable";
  }
}
