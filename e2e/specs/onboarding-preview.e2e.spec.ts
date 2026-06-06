import { test, expect } from "@playwright/test";
import {
  registerE2eUser,
  seedSessionStorage,
  samplePhotoPath,
  readDemoCandidateMappingNote,
} from "../fixtures/api.js";
import { PreviewPoolNetworkTracker } from "../fixtures/network.js";
import { completeQuestionnaireWizard } from "../fixtures/questionnaire-ui.js";

/**
 * Onboarding UI path (verified manually):
 * Register → photo upload → aesthetic preference → photo preview 3-2-1 → questionnaire → matching waiting.
 *
 * Prereqs (local):
 * - API on :3000, Web on :5173
 * - Demo candidates imported: pnpm --filter @peima/api run p75:r4-import-candidate-images -- --folder=dev-assets/test-user-images --dryRun=false
 */
test.describe("onboarding photo preview 3-2-1", () => {
  test("register through preview pool and questionnaire", async ({
    page,
    request,
  }) => {
    test.info().annotations.push({
      type: "prerequisite",
      description: readDemoCandidateMappingNote(),
    });

    const user = await registerE2eUser(request, "E2E-Onboard");
    await seedSessionStorage(page, user);

    const qs = `?userId=${encodeURIComponent(user.userId)}`;
    const network = new PreviewPoolNetworkTracker();
    network.attach(page);

    // --- Photo upload (must use localhost origin — API CORS allowlist) ---
    await page.goto(`/onboarding/photo-upload${qs}`);
    await expect(
      page.getByRole("heading", { name: "上传一张清晰本人照片" }),
    ).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles(samplePhotoPath());
    await expect(page.getByText(/已选择：/)).toBeVisible();
    await page.getByRole("button", { name: "上传并继续" }).click();
    await expect(page).toHaveURL(/\/onboarding\/photo-preference/, {
      timeout: 120_000,
    });

    // --- Aesthetic preference ---
    await expect(page.getByRole("heading", { name: "审美偏好" })).toBeVisible();
    await page.getByRole("button", { name: "清爽自然" }).click();
    await page.getByRole("button", { name: "保存并继续" }).click();

    // --- Photo preview ---
    await expect(page.getByRole("heading", { name: "第一印象预览" })).toBeVisible({
      timeout: 30_000,
    });

    const generateBtn = page.getByRole("button", { name: "生成预览" });
    if (await generateBtn.isVisible().catch(() => false)) {
      await generateBtn.click();
    }

    await expect(page.locator("article")).toHaveCount(6, { timeout: 90_000 });

    await expect(page.locator("article").filter({ hasText: "清晰" })).toHaveCount(3);
    await expect(page.locator("article").filter({ hasText: "朦胧" })).toHaveCount(2);
    await expect(page.locator("article").filter({ hasText: "待解锁" })).toHaveCount(1);

    for (const rank of ["#1", "#2", "#3", "#4", "#5", "#6"]) {
      await expect(page.getByText(rank, { exact: true })).toBeVisible();
    }

    network.assertPreviewPoolContract();

    // --- Acknowledge preview → embedded questionnaire ---
    await page.getByRole("button", { name: "看完了，继续问卷" }).click();
    await expect(page.getByRole("heading", { name: "填写问卷" })).toBeVisible({
      timeout: 30_000,
    });

    await completeQuestionnaireWizard(page);

    // --- Matching waiting (enqueue UI, no worker required) ---
    await page.getByRole("button", { name: "下一步：前往匹配" }).click();
    await expect(page).toHaveURL(/\/matching-waiting/);
    await expect(page.getByRole("heading", { name: "匹配结果" })).toBeVisible();
    await expect(page.locator("body")).not.toBeEmpty();
  });
});
