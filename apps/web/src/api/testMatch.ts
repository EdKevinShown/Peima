import { authHeaders, baseUrl, handleJson } from "./auth";

export type TestMatchingCapabilities = {
  testBatchMatchTrigger: boolean;
  testPreviewPoolSeed: boolean;
};

export async function getTestMatchingCapabilities(): Promise<TestMatchingCapabilities> {
  const res = await fetch(`${baseUrl}/test/matching/capabilities`, {
    headers: authHeaders(),
  });
  if (res.status === 401) {
    return { testBatchMatchTrigger: false, testPreviewPoolSeed: false };
  }
  return handleJson<TestMatchingCapabilities>(res);
}

export async function runTestBatchMatchOnce(): Promise<{ ok: true }> {
  const res = await fetch(`${baseUrl}/test/matching/run-batch-once`, {
    method: "POST",
    headers: authHeaders(),
  });
  return handleJson<{ ok: true }>(res);
}
