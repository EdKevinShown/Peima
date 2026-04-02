import { runBatchMatch } from "./jobs/batch-match.processor.js";
import { registerDailyMatchCron, runDailyMatchOnce } from "./schedulers/daily-match.scheduler.js";

const argv = process.argv.slice(2);

async function main() {
  console.log("worker started");

  // Always register cron when worker starts.
  registerDailyMatchCron();

  if (argv.includes("--batch-match")) {
    await runDailyMatchOnce();
    process.exit(0);
  }
  if (argv.includes("--daily-match")) {
    await runDailyMatchOnce();
    process.exit(0);
  }
  console.log(
    "worker running with cron (pass --batch-match or --daily-match to run once)",
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
