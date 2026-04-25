/**
 * One-off: copy dev-assets images into API upload dir and insert user_images rows.
 *
 * Prereq: DATABASE_URL in env (e.g. from repo root: dotenv -e .env -- node ...).
 * Paths default to monorepo layout; override with env if needed.
 */
import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** packages/database/scripts -> repo root */
const REPO_ROOT = join(__dirname, "..", "..", "..");

const DEFAULT_IMAGE_DIR = join(REPO_ROOT, "dev-assets", "test-user-images");
const DEFAULT_MAPPING_PATH = join(DEFAULT_IMAGE_DIR, "mapping.json");
const DEFAULT_UPLOAD_DIR = join(REPO_ROOT, "apps", "api", "uploads", "user-images");

const IMAGE_DIR = process.env.IMPORT_TEST_IMAGES_DIR?.trim() || DEFAULT_IMAGE_DIR;
const MAPPING_PATH = process.env.IMPORT_TEST_MAPPING_PATH?.trim() || DEFAULT_MAPPING_PATH;
const UPLOAD_DIR = process.env.UPLOAD_DIR?.trim() || DEFAULT_UPLOAD_DIR;

function loadMapping() {
  const raw = readFileSync(MAPPING_PATH, "utf8");
  const data = JSON.parse(raw);
  if (!data || typeof data !== "object") {
    throw new Error("mapping.json: root must be an object");
  }
  const publicBaseUrl = String(data.publicBaseUrl ?? "").replace(/\/+$/, "");
  if (!publicBaseUrl) {
    throw new Error("mapping.json: publicBaseUrl is required");
  }
  const items = data.items;
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("mapping.json: items must be a non-empty array");
  }
  return { publicBaseUrl, items };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is missing. Example from repo root:");
    console.error(
      "  dotenv -e .env --override -- node packages/database/scripts/import-test-user-images.mjs",
    );
    process.exit(1);
  }

  if (!existsSync(MAPPING_PATH)) {
    console.error("Mapping file not found:", MAPPING_PATH);
    process.exit(1);
  }
  if (!existsSync(IMAGE_DIR)) {
    console.error("Image directory not found:", IMAGE_DIR);
    process.exit(1);
  }

  const { publicBaseUrl, items } = loadMapping();
  mkdirSync(UPLOAD_DIR, { recursive: true });

  const prisma = new PrismaClient();
  const missingFiles = [];
  const missingUsers = [];
  const successes = [];

  try {
    for (const raw of items) {
      const file = typeof raw?.file === "string" ? raw.file.trim() : "";
      const userId = typeof raw?.userId === "string" ? raw.userId.trim() : "";
      if (!file || !userId) {
        console.warn("[skip] invalid item (need file + userId):", raw);
        continue;
      }

      const srcPath = join(IMAGE_DIR, file);
      if (!existsSync(srcPath)) {
        missingFiles.push({ file, userId, resolvedPath: srcPath });
        console.warn("[missing file]", file, "for userId", userId);
        continue;
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        missingUsers.push({ file, userId });
        console.warn("[missing user]", userId, "file", file);
        continue;
      }

      let ext = extname(file);
      if (!ext) {
        ext = ".jpg";
      }
      const stored = `${userId}-${randomUUID()}${ext}`;
      const destPath = join(UPLOAD_DIR, stored);
      copyFileSync(srcPath, destPath);

      const imageUrl = `${publicBaseUrl}/uploads/user-images/${stored}`;
      const row = await prisma.userImage.create({
        data: {
          userId,
          imageUrl,
        },
      });

      successes.push({ userId, imageUrl, imageId: row.id, storedName: stored });
      console.log("[ok]", userId);
      console.log("     imageUrl:", imageUrl);
    }

    console.log("\n--- summary ---");
    console.log("success:", successes.length);
    for (const s of successes) {
      console.log("  userId:", s.userId);
      console.log("  imageUrl:", s.imageUrl);
    }
    if (missingFiles.length) {
      console.log("\nmissing source file(s):", missingFiles.length);
      for (const m of missingFiles) {
        console.log("  file:", m.file, "userId:", m.userId);
        console.log("  path:", m.resolvedPath);
      }
    }
    if (missingUsers.length) {
      console.log("\nuserId not found:", missingUsers.length);
      for (const m of missingUsers) {
        console.log("  userId:", m.userId, "file:", m.file);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
