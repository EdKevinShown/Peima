/** P0：与 matching 页一致 — ?userId= 优先，其次 localStorage.peimaUserId */
const HARDCODED_TEST_USER_ID = "";

export function resolveUserId(searchParams) {
  const fromQuery = searchParams.get("userId");
  if (fromQuery) return fromQuery.trim();
  try {
    const fromStore = localStorage.getItem("peimaUserId");
    if (fromStore) return fromStore.trim();
  } catch {
    /* ignore */
  }
  return HARDCODED_TEST_USER_ID.trim();
}
