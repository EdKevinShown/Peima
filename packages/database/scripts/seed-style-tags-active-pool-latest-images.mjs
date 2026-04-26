/**
 * Local / test only: set `user_images.styleTags` on each **latest** image (by createdAt desc)
 * for the six candidates in the viewer's **latest active** preview pool — so
 * `computeStyleScore` can return non-zero for some slots (viewer styleTags must already be non-empty).
 *
 * Rules (fixed, no randomness):
 * - Reads viewer `user_preferences.styleTags`; uses **first non-empty trimmed tag** as the
 *   intersection token `PRIMARY` (must match viewer DB string after trim for worker/shared norm).
 * - Pool items ordered by `rankInPool` asc; first **3** slots: `styleTags = [PRIMARY, 'peima-style-seed-a']`
 *   → guaranteed intersection with viewer → styleScore > 0 when viewer lists PRIMARY.
 * - Slots **3–5**: `styleTags = ['peima-style-seed-z']` only → no intersection with typical viewer tags
 *   → styleScore 0 but styleWeightActive stays true if viewer has tags.
 *
 * Does not touch: computeStyleScore, worker, MatchResult, shortlist rules, questionnaire, product API.
 *
 * Usage from repo root:
 *   dotenv -e .env --override -- node packages/database/scripts/seed-style-tags-active-pool-latest-images.mjs <viewerUserId>
 */
import { PrismaClient } from "@prisma/client";

const POOL_ACTIVE = "active";
const TAG_INTERSECT_EXTRA = "peima-style-seed-a";
const TAG_NO_INTERSECT = "peima-style-seed-z";

async function main() {
  const viewerUserId = process.argv[2]?.trim();
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is missing. From repo root:");
    console.error(
      "  dotenv -e .env --override -- node packages/database/scripts/seed-style-tags-active-pool-latest-images.mjs <viewerUserId>",
    );
    process.exit(1);
  }
  if (!viewerUserId) {
    console.error(
      "Usage: node .../seed-style-tags-active-pool-latest-images.mjs <viewerUserId>",
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    const pref = await prisma.userPreference.findUnique({
      where: { userId: viewerUserId },
    });
    const viewerStyleTags = (pref?.styleTags ?? [])
      .map((t) => String(t).trim())
      .filter(Boolean);
    if (viewerStyleTags.length === 0) {
      throw new Error(
        "Viewer user_preferences.styleTags is empty. Save style tags via AccountPage or PUT /preferences/:userId first.",
      );
    }
    const primary = viewerStyleTags[0];
    console.log("viewer styleTags (first used for intersection):", primary, "| full:", viewerStyleTags);

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

    console.log("poolId:", pool.id, "candidates (by rank):", Math.min(6, items.length));

    const maxSlots = Math.min(6, items.length);
    for (let i = 0; i < maxSlots; i += 1) {
      const cid = items[i].candidateUserId;
      const rank = items[i].rankInPool;

      const img = await prisma.userImage.findFirst({
        where: { userId: cid },
        orderBy: { createdAt: "desc" },
      });

      if (!img) {
        console.warn(`[skip] no user_images for candidateUserId=${cid} rankInPool=${rank}`);
        continue;
      }

      const styleTags =
        i < 3 ? [primary, TAG_INTERSECT_EXTRA] : [TAG_NO_INTERSECT];

      await prisma.userImage.update({
        where: { id: img.id },
        data: { styleTags },
      });

      console.log(
        "[ok] rankInPool=",
        rank,
        "candidateUserId=",
        cid,
        "imageId=",
        img.id,
        "styleTags=",
        JSON.stringify(styleTags),
        i < 3 ? "(intersect slot)" : "(no-intersect slot)",
      );
    }

    console.log(
      "\nVerify: GET /preview-pool/user/",
      viewerUserId,
      "/latest — expect styleWeightActive true and styleScore > 0 for at least one candidate (ranks 1–3 slots above).",
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
