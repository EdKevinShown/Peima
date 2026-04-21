/**
 * One-off local test data: 6 candidate users + 1 user_images each for preview-pool /generate.
 * Idempotent: fixed phones; skips user if exists and already has >=1 image; adds image if user exists with 0 images.
 * Does not read or modify any specific viewer user.
 */
import { PrismaClient } from "@prisma/client";

const PLACEHOLDER_IMAGE_URL =
  "https://example.com/peima-preview-pool-seed-placeholder.png";

/** Reserved test phones — avoid using these for your real viewer account. */
const SEED_PHONES = [
  "+8613999999001",
  "+8613999999002",
  "+8613999999003",
  "+8613999999004",
  "+8613999999005",
  "+8613999999006",
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is missing. Run via dotenv from repo root (see package comment below).");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const summary = { createdUsers: 0, skippedUsers: 0, createdImages: 0, skippedImages: 0 };

  try {
    for (const phone of SEED_PHONES) {
      let user = await prisma.user.findUnique({ where: { phone } });

      if (!user) {
        user = await prisma.user.create({
          data: {
            phone,
            nickname: `PreviewPool seed ${phone.slice(-4)}`,
          },
        });
        summary.createdUsers += 1;
      } else {
        summary.skippedUsers += 1;
      }

      const imageCount = await prisma.userImage.count({
        where: { userId: user.id },
      });

      if (imageCount === 0) {
        await prisma.userImage.create({
          data: {
            userId: user.id,
            imageUrl: PLACEHOLDER_IMAGE_URL,
          },
        });
        summary.createdImages += 1;
      } else {
        summary.skippedImages += 1;
      }
    }

    console.log("seed-preview-pool-min done:", summary);
    console.log(
      "Expect 6 rows with phones",
      SEED_PHONES.join(", "),
      "each with >=1 user_images.",
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
