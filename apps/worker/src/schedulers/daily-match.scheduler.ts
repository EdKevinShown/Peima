import { runBatchMatch } from "../jobs/batch-match.processor.js";
import cron from "node-cron";

function schedulerLog(parts: Record<string, string | undefined>) {
  const ts = new Date().toISOString();
  const kv = Object.entries({ ts, ...parts })
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${v}`);
  console.log(`[daily-match.scheduler] ${kv.join(" ")}`);
}

/**
 * P0: no real cron here — call this from CLI, a hosted scheduler, or `main` when wiring production.
 */
export async function runDailyMatchOnce(): Promise<void> {
  schedulerLog({ event: "run_once_start", note: "runDailyMatchOnce→runBatchMatch" });
  try {
    schedulerLog({ event: "batch_invoke", source: "runDailyMatchOnce" });
    await runBatchMatch();
    schedulerLog({ event: "batch_done", source: "runDailyMatchOnce", outcome: "ok" });
  } catch (e) {
    schedulerLog({
      event: "batch_done",
      source: "runDailyMatchOnce",
      outcome: "fail",
    });
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
      schedulerLog({ event: "batch_invoke", source: "cron", cronExpr: expr });
      try {
        await runBatchMatch();
        schedulerLog({
          event: "batch_done",
          source: "cron",
          outcome: "ok",
          cronExpr: expr,
        });
      } catch {
        schedulerLog({
          event: "batch_done",
          source: "cron",
          outcome: "fail",
          cronExpr: expr,
        });
      }
    },
    { timezone },
  );
}
