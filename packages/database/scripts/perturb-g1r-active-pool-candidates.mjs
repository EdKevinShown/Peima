/**
 * Local / test only: apply fixed, slot-indexed G1R axis nudges to the **actual** six
 * `user_profile` rows for candidates in the viewer's **latest active** preview pool.
 *
 * --- Run policy (important) ---
 * **Intend to run at most once per active pool** for the same six candidates. Re-applying
 * stacks the same deltas again on `user_profile` and is discouraged for local smoke tests.
 *
 * **Idempotency:** after a successful perturb for a slot, this script writes a marker into
 * that row's `preview_pool_items.itemMeta.g1rActivePoolPerturbV0` (scoped to `poolId`).
 * A second run skips slots that already carry this marker for the current pool (no-op with log).
 * To deliberately re-apply on the same pool, pass `--force` (re-stacks deltas) or clear
 * `itemMeta.g1rActivePoolPerturbV0` on those items / generate a new pool.
 *
 * **Verification (preferred):** after running, call
 * `GET /preview-pool/user/:viewerUserId/latest` and inspect `shortlistContract.staticEvidence`
 * (`profileScalar` should no longer be identical across all six). **Do not re-generate**
 * the pool unless you need a new candidate set.
 *
 * Rules (keep aligned with `seed-six-pool-users-from-template.mjs`):
 * - Same `G1R_PROFILE_KEYS` order and `SLOT_PRIMARY_DELTA` as seed-six.
 * - Slot index = item order by `rankInPool` asc (0..5 for the first six items).
 * - Base values = **current** `user_profile` row for that candidate (read before update).
 * - clamp to [0,1]. No randomness. Does not touch questionnaire_answers, worker, or API.
 *
 * Usage from repo root:
 *   dotenv -e .env --override -- node packages/database/scripts/perturb-g1r-active-pool-candidates.mjs <viewerUserId>
 *   dotenv -e .env --override -- node packages/database/scripts/perturb-g1r-active-pool-candidates.mjs <viewerUserId> --force
 */
import { PrismaClient } from "@prisma/client";

const POOL_ACTIVE = "active";
const ITEM_META_KEY = "g1rActivePoolPerturbV0";

/** Must stay aligned with `apps/api/src/modules/questionnaire/questionnaire.scorer.ts` G1R_PROFILE_KEYS. */
const G1R_PROFILE_KEYS = [
  "attachmentStyle",
  "emotionalExpression",
  "communicationStyle",
  "conflictHandling",
  "loveLanguage",
  "securityNeed",
  "controlNeed",
  "independence",
  "loyaltyView",
  "jealousyTendency",
  "moneyAttitude",
  "careerPriority",
  "lifePace",
  "socialNeed",
  "emotionalStability",
  "sexualValues",
  "familyView",
  "marriageExpectation",
  "childrenIntent",
  "riskPreference",
];

/** Primary axis delta per slot i (0..5); secondary uses half this value. */
const SLOT_PRIMARY_DELTA = [0.03, -0.03, 0.04, -0.04, 0.05, -0.05];

function clamp01(x) {
  return Math.min(1, Math.max(0, x));
}

function parseArgs(argv) {
  const rest = argv.slice(2).filter((a) => a !== "--force");
  const force = argv.includes("--force");
  return { viewerUserId: rest[0]?.trim() ?? "", force };
}

function itemMetaWithMarker(prevMeta, poolId, rankInPool) {
  const base =
    prevMeta != null && typeof prevMeta === "object" && !Array.isArray(prevMeta)
      ? { ...prevMeta }
      : {};
  base[ITEM_META_KEY] = {
    poolId,
    rankInPool,
    appliedAt: new Date().toISOString(),
    script: "perturb-g1r-active-pool-candidates.mjs",
  };
  return base;
}

function alreadyPerturbedForPool(itemMeta, poolId) {
  const m = itemMeta?.[ITEM_META_KEY];
  return m != null && typeof m === "object" && m.poolId === poolId;
}

/**
 * Slot i: nudge G1R_PROFILE_KEYS[i] and G1R_PROFILE_KEYS[(i+10)%20] using **baseProfile** as baseline.
 */
function buildG1rPerturbationData(baseProfile, slotIndex) {
  const primaryKey = G1R_PROFILE_KEYS[slotIndex];
  const secondaryKey = G1R_PROFILE_KEYS[(slotIndex + 10) % 20];
  const d = SLOT_PRIMARY_DELTA[slotIndex];
  const data = {};

  const baseP = baseProfile[primaryKey];
  if (typeof baseP === "number") {
    data[primaryKey] = clamp01(baseP + d);
  }

  if (secondaryKey !== primaryKey) {
    const baseS = baseProfile[secondaryKey];
    if (typeof baseS === "number") {
      data[secondaryKey] = clamp01(baseS + d * 0.5);
    }
  }

  return data;
}

async function main() {
  const { viewerUserId, force } = parseArgs(process.argv);
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is missing. From repo root:");
    console.error(
      "  dotenv -e .env --override -- node packages/database/scripts/perturb-g1r-active-pool-candidates.mjs <viewerUserId>",
    );
    process.exit(1);
  }
  if (!viewerUserId) {
    console.error(
      "Usage: node .../perturb-g1r-active-pool-candidates.mjs <viewerUserId> [--force]",
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    const pool = await prisma.previewPool.findFirst({
      where: { userId: viewerUserId, status: POOL_ACTIVE },
      orderBy: { createdAt: "desc" },
      include: {
        items: { orderBy: { rankInPool: "asc" } },
      },
    });

    if (!pool) {
      throw new Error(`No active preview pool for userId=${viewerUserId} (status=${POOL_ACTIVE})`);
    }

    const items = pool.items;
    if (items.length === 0) {
      throw new Error(`Preview pool ${pool.id} has no items`);
    }

    console.log("poolId:", pool.id, "items:", items.length);
    if (force) {
      console.warn(
        "[warn] --force: re-applying deltas on current user_profile (stacking). Prefer a fresh pool or clear itemMeta markers instead.",
      );
    } else {
      console.log(
        "[policy] Run at most once per this active pool; skipped slots log [noop]. Use --force to re-apply (stacks deltas).",
      );
    }

    const maxSlots = Math.min(6, items.length);
    let applied = 0;
    let noop = 0;

    for (let i = 0; i < maxSlots; i += 1) {
      const row = items[i];
      const cid = row.candidateUserId;
      const rank = row.rankInPool;

      if (!force && alreadyPerturbedForPool(row.itemMeta, pool.id)) {
        console.log(
          "[noop] slot",
          i,
          "rankInPool=",
          rank,
          "candidateUserId=",
          cid,
          "— already perturbed for this poolId (no delta stacked).",
        );
        noop += 1;
        continue;
      }

      const prof = await prisma.userProfile.findUnique({ where: { userId: cid } });
      if (!prof) {
        console.warn(`[skip] no user_profile for candidateUserId=${cid} rankInPool=${rank}`);
        continue;
      }

      const data = buildG1rPerturbationData(prof, i);
      const keys = Object.keys(data);
      if (keys.length === 0) {
        console.warn(
          `[skip] slot ${i} candidate=${cid}: no numeric G1R on primary/secondary axes (template-like nulls)`,
        );
        continue;
      }

      await prisma.userProfile.update({
        where: { userId: cid },
        data,
      });

      await prisma.previewPoolItem.update({
        where: { id: row.id },
        data: { itemMeta: itemMetaWithMarker(row.itemMeta, pool.id, rank) },
      });

      const pk = G1R_PROFILE_KEYS[i];
      const sk = G1R_PROFILE_KEYS[(i + 10) % 20];
      console.log(
        "[g1r perturb]",
        "rankInPool=",
        rank,
        "slot=",
        i,
        "candidateUserId=",
        cid,
        "axes",
        pk,
        sk,
        "keysWritten",
        keys.join(","),
      );
      applied += 1;
    }

    if (!force && applied === 0 && noop === maxSlots) {
      console.log(
        "\nAll targeted slots already had g1rActivePoolPerturbV0 for this pool — no profile writes.",
      );
    }

    console.log(
      "\nDone. Prefer verification: GET /preview-pool/user/",
      viewerUserId,
      "/latest → shortlistContract.staticEvidence[*].profileScalar (no regenerate unless you need new candidates).",
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
