import { runBatchMatch } from "../jobs/batch-match.processor.js";
import cron from "node-cron";

/**
 * P0: no real cron here — call this from CLI, a hosted scheduler, or `main` when wiring production.
 */
export async function runDailyMatchOnce(): Promise<void> {
  console.log("[daily-match.scheduler] runDailyMatchOnce → runBatchMatch()");
  try {
    console.log("[daily-match.scheduler] batch started");
    await runBatchMatch();
    console.log("[daily-match.scheduler] batch completed");
  } catch (e) {
    console.error("[daily-match.scheduler] batch failed");
    throw e;
  }
}

let job: ReturnType<typeof cron.schedule> | null = null;

export function registerDailyMatchCron(): void {
  if (job) return;

  const expr = process.env.MATCH_CRON?.trim() || "0 20 * * *";
  const timezone = process.env.TZ || "Asia/Shanghai";
  console.log(
    `[daily-match.scheduler] cron registered: MATCH_CRON="${expr}", TZ="${timezone}"`,
  );

  job = cron.schedule(
    expr,
    async () => {
      console.log("[daily-match.scheduler] batch started");
      try {
        await runBatchMatch();
        console.log("[daily-match.scheduler] batch completed");
      } catch (e) {
        console.error("[daily-match.scheduler] batch failed");
      }
    },
    { timezone },
  );
}
