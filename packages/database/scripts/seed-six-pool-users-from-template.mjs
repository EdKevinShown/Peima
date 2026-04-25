/**
 * One-off local: create (or backfill) 6 users that have the same questionnaire
 * answers + user_profile as a template user — so they qualify for preview pool
 * (profile + you can add images separately).
 *
 * Does NOT touch Match Review, images, or matching logic.
 *
 * Usage from repo root:
 *   dotenv -e .env --override -- node packages/database/scripts/seed-six-pool-users-from-template.mjs [templateUserId]
 *
 * If templateUserId omitted: picks any user with user_profile + >=30 questionnaire_answers.
 */
import { PrismaClient } from "@prisma/client";

/** Reserved phones; avoid using for your real viewer account. */
const POOL_CANDIDATE_PHONES = [
  "+8613999988001",
  "+8613999988002",
  "+8613999988003",
  "+8613999988004",
  "+8613999988005",
  "+8613999988006",
];

function profileScalars(profile) {
  const {
    id: _id,
    userId: _uid,
    createdAt: _ca,
    updatedAt: _ua,
    ...rest
  } = profile;
  return rest;
}

async function pickTemplateUserId(prisma, explicit) {
  if (explicit) {
    const u = await prisma.user.findUnique({
      where: { id: explicit },
      include: {
        relationProfile: true,
        questionnaireAnswers: true,
      },
    });
    if (!u) throw new Error(`template user not found: ${explicit}`);
    if (!u.relationProfile) throw new Error(`template has no user_profile: ${explicit}`);
    if (u.questionnaireAnswers.length < 30) {
      throw new Error(
        `template has only ${u.questionnaireAnswers.length} answers (need 30): ${explicit}`,
      );
    }
    return explicit;
  }

  const candidates = await prisma.user.findMany({
    where: { relationProfile: { isNot: null } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  for (const { id } of candidates) {
    const n = await prisma.questionnaireAnswer.count({ where: { userId: id } });
    if (n >= 30) return id;
  }

  throw new Error(
    "No user with user_profile + 30 answers. Submit questionnaire once for any user, then re-run with that userId as template.",
  );
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is missing. From repo root:");
    console.error(
      "  dotenv -e .env --override -- node packages/database/scripts/seed-six-pool-users-from-template.mjs [templateUserId]",
    );
    process.exit(1);
  }

  const explicitTemplate = process.argv[2]?.trim() || "";
  const prisma = new PrismaClient();

  try {
    const templateUserId = await pickTemplateUserId(prisma, explicitTemplate);

    const template = await prisma.user.findUniqueOrThrow({
      where: { id: templateUserId },
      include: {
        relationProfile: true,
        questionnaireAnswers: { orderBy: { questionKey: "asc" } },
      },
    });

    if (!template.relationProfile) {
      throw new Error("template has no user_profile row");
    }
    if (template.questionnaireAnswers.length < 30) {
      throw new Error(
        `template needs 30 questionnaire answers, got ${template.questionnaireAnswers.length}`,
      );
    }

    const answerRows = template.questionnaireAnswers.map((a) => ({
      questionKey: a.questionKey,
      answerValue: a.answerValue,
    }));
    const profileData = profileScalars(template.relationProfile);

    console.log("template userId:", templateUserId);
    console.log("cloning answers + user_profile to", POOL_CANDIDATE_PHONES.length, "phones\n");

    const createdIds = [];

    for (let i = 0; i < POOL_CANDIDATE_PHONES.length; i += 1) {
      const phone = POOL_CANDIDATE_PHONES[i];
      const nickname = `Pool candidate ${String(i + 1).padStart(2, "0")}`;

      let user = await prisma.user.findUnique({ where: { phone } });
      if (!user) {
        user = await prisma.user.create({
          data: {
            phone,
            nickname,
          },
        });
        console.log("[create user]", user.id, phone);
      } else {
        console.log("[existing user]", user.id, phone);
      }

      const hasProfile = await prisma.userProfile.findUnique({
        where: { userId: user.id },
      });

      if (hasProfile) {
        console.log("  skip (already has user_profile):", user.id);
        createdIds.push(user.id);
        continue;
      }

      await prisma.$transaction(async (tx) => {
        await tx.questionnaireAnswer.deleteMany({ where: { userId: user.id } });
        await tx.questionnaireAnswer.createMany({
          data: answerRows.map((a) => ({
            userId: user.id,
            questionKey: a.questionKey,
            answerValue: a.answerValue,
          })),
        });
        await tx.userProfile.create({
          data: {
            userId: user.id,
            ...profileData,
          },
        });
      });

      console.log("  [ok] cloned profile + answers for", user.id);
      createdIds.push(user.id);
    }

    console.log("\n--- done: 6 candidate user ids (for mapping / list script) ---");
    for (const id of createdIds) {
      console.log(id);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
