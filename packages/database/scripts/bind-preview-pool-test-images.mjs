/**
 * One-off local test binding for B1 visual-enhance validation:
 * bind 3 existing candidate users to test-user-images7/8/9 as their only first image.
 *
 * Default mode is DRY RUN.
 * Apply mode requires: BIND_TEST_IMAGES_APPLY=1
 *
 * Usage from repo root:
 *   pnpm exec dotenv -e .env -- node packages/database/scripts/bind-preview-pool-test-images.mjs
 *   $env:BIND_TEST_IMAGES_APPLY=1; pnpm exec dotenv -e .env -- node packages/database/scripts/bind-preview-pool-test-images.mjs
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");
const DEFAULT_IMAGE_DIR = join(REPO_ROOT, "dev-assets", "test-user-images");
const DEFAULT_UPLOAD_DIR = join(REPO_ROOT, "apps", "api", "uploads", "user-images");

const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const APPLY = process.env.BIND_TEST_IMAGES_APPLY === "1";

const BINDINGS = [
  { userId: "cmoc1gnil00006z64l9w2oa5t", file: "test-user-images7.jpg" },
  { userId: "cmoc1gnjc000x6z64esun9iur", file: "test-user-images8.jpg" },
  { userId: "cmoc1gnjo001u6z64ghwpseih", file: "test-user-images9.jpg" },
];

function ensureJpgOrPng(file) {
  const ext = extname(file).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg" || ext === ".png") return ext;
  throw new Error(`unsupported extension for ${file}; allowed .jpg/.jpeg/.png`);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is missing; run with dotenv -e .env.");
    process.exit(1);
  }

  const imageDir = process.env.BIND_TEST_IMAGES_DIR?.trim() || DEFAULT_IMAGE_DIR;
  const uploadDir = process.env.UPLOAD_DIR?.trim() || DEFAULT_UPLOAD_DIR;
  mkdirSync(uploadDir, { recursive: true });

  const prisma = new PrismaClient();
  try {
    console.log(`[bind-preview-pool-test-images] mode=${APPLY ? "APPLY" : "DRY_RUN"}`);
    console.log(`[bind-preview-pool-test-images] imageDir=${imageDir}`);
    console.log(`[bind-preview-pool-test-images] uploadDir=${uploadDir}`);
    console.log(`[bind-preview-pool-test-images] publicBaseUrl=${PUBLIC_BASE_URL}`);

    for (const row of BINDINGS) {
      const ext = ensureJpgOrPng(row.file);
      const src = join(imageDir, row.file);
      if (!existsSync(src)) {
        console.log(`[skip] missing source file userId=${row.userId} file=${row.file}`);
        continue;
      }

      const user = await prisma.user.findUnique({ where: { id: row.userId } });
      if (!user) {
        console.log(`[skip] user not found userId=${row.userId}`);
        continue;
      }

      const existing = await prisma.userImage.findMany({
        where: { userId: row.userId },
        orderBy: { createdAt: "asc" },
        select: { id: true, imageUrl: true, createdAt: true },
      });
      const currentFirst = existing[0];
      console.log(
        `[plan] userId=${row.userId} currentImages=${existing.length} currentFirst=${currentFirst?.imageUrl ?? "none"} -> file=${row.file}`,
      );

      const storedName = `${row.userId}-bind-b1-${basename(row.file, ext)}${ext}`;
      const dest = join(uploadDir, storedName);
      const imageUrl = `${PUBLIC_BASE_URL}/uploads/user-images/${storedName}`;

      if (!APPLY) {
        console.log(`[dry] would copy ${row.file} -> ${storedName}`);
        console.log(`[dry] would replace all user_images for userId=${row.userId} with imageUrl=${imageUrl}`);
        continue;
      }

      copyFileSync(src, dest);
      await prisma.$transaction(async (tx) => {
        await tx.userImage.deleteMany({ where: { userId: row.userId } });
        await tx.userImage.create({
          data: { userId: row.userId, imageUrl },
        });
      });
      console.log(`[ok] userId=${row.userId} firstImage=${imageUrl}`);
    }

    console.log("[bind-preview-pool-test-images] done");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

