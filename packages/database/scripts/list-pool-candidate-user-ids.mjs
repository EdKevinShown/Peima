/**
 * Read-only: print up to 6 userIds suitable for preview-pool image seeding.
 * - Excludes optional viewer id (argv[1] or VIEWER_USER_ID)
 * - Requires questionnaire profile (user_profile row via relationProfile)
 * - Prefers users with fewer / zero user_images
 *
 * Usage from repo root:
 *   dotenv -e .env --override -- node packages/database/scripts/list-pool-candidate-user-ids.mjs
 *   dotenv -e .env --override -- node packages/database/scripts/list-pool-candidate-user-ids.mjs <viewerUserId>
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");
const DEFAULT_MAPPING_DIR = join(REPO_ROOT, "dev-assets", "test-user-images");

function tryLoadPublicBaseUrl() {
  const p = join(DEFAULT_MAPPING_DIR, "mapping.json");
  try {
    const raw = readFileSync(p, "utf8");
    const j = JSON.parse(raw);
    const u = String(j?.publicBaseUrl ?? "").replace(/\/+$/, "");
    return u || null;
  } catch {
    return null;
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is missing. From repo root:");
    console.error(
      "  dotenv -e .env --override -- node packages/database/scripts/list-pool-candidate-user-ids.mjs [viewerUserId]",
    );
    process.exit(1);
  }

  const viewerId =
    (process.argv[2] && String(process.argv[2]).trim()) ||
    process.env.VIEWER_USER_ID?.trim() ||
    "";

  const prisma = new PrismaClient();
  try {
    const rows = await prisma.user.findMany({
      where: {
        relationProfile: { isNot: null },
        ...(viewerId ? { id: { not: viewerId } } : {}),
      },
      select: {
        id: true,
        nickname: true,
        phone: true,
        images: { select: { id: true } },
      },
      take: 500,
    });

    rows.sort((a, b) => a.images.length - b.images.length);
    const picked = rows.slice(0, 6);

    console.log("--- candidates (profile ok, image count asc) ---\n");
    if (!viewerId) {
      console.log(
        "(tip) pass viewer userId as first arg or VIEWER_USER_ID to exclude your login user from this list\n",
      );
    } else {
      console.log("excluded viewer:", viewerId, "\n");
    }

    for (const u of picked) {
      console.log(
        `${u.id}\timages=${u.images.length}\t${u.nickname ?? ""}\t${u.phone ?? ""}`,
      );
    }

    if (picked.length < 6) {
      console.log(
        `\n[warn] only ${picked.length} user(s) matched (need more users with user_profile, excluding viewer).`,
      );
    }

    const base =
      tryLoadPublicBaseUrl() ||
      "http://127.0.0.1:3000";
    console.log("\n--- paste into mapping.json `items` (edit publicBaseUrl if needed) ---\n");
    const items = picked.map((u, i) => ({
      file: `test-user-images${i + 1}.jpg`,
      userId: u.id,
    }));
    console.log(
      JSON.stringify(
        { version: 1, publicBaseUrl: base, items },
        null,
        2,
      ),
    );
    console.log(
      "\nIf your files have no .jpg extension, rename `file` to match disk names.",
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
