import { authHeaders, baseUrl, handleJson } from "./auth";

export type AdminCapabilities = {
  batchMatchTrigger: boolean;
};

export async function getAdminCapabilities(): Promise<AdminCapabilities> {
  const res = await fetch(`${baseUrl}/admin/capabilities`, {
    headers: authHeaders(),
  });
  if (res.status === 401) {
    return { batchMatchTrigger: false };
  }
  return handleJson<AdminCapabilities>(res);
}

export async function runAdminBatchMatchOnce(): Promise<{ ok: true }> {
  const res = await fetch(`${baseUrl}/admin/batch-match/run-once`, {
    method: "POST",
    headers: authHeaders(),
  });
  return handleJson<{ ok: true }>(res);
}
