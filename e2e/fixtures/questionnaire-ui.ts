import type { Page } from "@playwright/test";

/** Walk the 30-question wizard: gender step, pick first option, next, submit. */
export async function completeQuestionnaireWizard(page: Page): Promise<void> {
  const startBtn = page.getByRole("button", { name: "开始答题" });
  if (await startBtn.isVisible().catch(() => false)) {
    const genderBtn = page.getByRole("button", { name: "男" });
    if (await genderBtn.isVisible().catch(() => false)) {
      await genderBtn.click();
    }
    await startBtn.click();
  }

  await page.getByRole("progressbar", { name: "问卷进度" }).waitFor({
    timeout: 60_000,
  });

  for (let i = 0; i < 35; i++) {
    const submitBtn = page.getByRole("button", { name: "提交问卷" });
    if (await submitBtn.isVisible().catch(() => false)) {
      await page.locator(".q-wizard-option").first().click();
      await submitBtn.click();
      await page.getByText("问卷已提交").waitFor({ timeout: 60_000 });
      return;
    }

    const option = page.locator(".q-wizard-option").first();
    await option.waitFor({ timeout: 15_000 });
    await option.click();

    const nextBtn = page.getByRole("button", { name: "下一题" });
    if (await nextBtn.isVisible().catch(() => false)) {
      await nextBtn.click();
      continue;
    }
  }

  throw new Error("questionnaire wizard did not reach submit within step limit");
}
