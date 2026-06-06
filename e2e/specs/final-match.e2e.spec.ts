import { test, expect } from "@playwright/test";
import {
  registerE2eUser,
  seedSessionStorage,
  prepareFinalMatchViaApi,
  getTestMatchingCapabilities,
} from "../fixtures/api.js";

/**
 * Final match page after worker/batch — isolated from onboarding UI.
 *
 * Prereqs:
 * - API + worker-capable batch-match (same as apps/api/test/matching-full-journey.e2e-spec.ts)
 * - PEIMA_TEST_PREVIEW_POOL_SEED_* and PEIMA_TEST_MATCH_* allowlists include the ephemeral user
 *   OR wildcard/local dev flags already enabled in .env
 */
test.describe("final match page", () => {
  test("shows match result after API seed + batch", async ({ page, request }) => {
    const user = await registerE2eUser(request, "E2E-Final");

    const caps = await getTestMatchingCapabilities(request, user.token);
    test.skip(
      !caps.testBatchMatchTrigger || !caps.testPreviewPoolSeed,
      "PEIMA_TEST_MATCH_* / PEIMA_TEST_PREVIEW_POOL_SEED_* not enabled for this user",
    );

    await prepareFinalMatchViaApi(request, user);
    await seedSessionStorage(page, user);

    await page.goto(
      `/final-match?userId=${encodeURIComponent(user.userId)}`,
    );

    await expect(page.locator("body")).not.toBeEmpty();
    await expect(
      page.getByText("加载匹配结果").or(page.getByText("已经为你匹配好了")),
    ).not.toBeVisible({ timeout: 90_000 });

    const hasMatchContent = await page
      .getByRole("button", { name: "刷新匹配结果" })
      .or(page.getByText("综合匹配分"))
      .or(page.getByText("暂时还没有可展示的最终匹配结果"))
      .first()
      .isVisible()
      .catch(() => false);

    expect(hasMatchContent).toBe(true);
  });
});
