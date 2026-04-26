/**
 * One-off local: create (or backfill) 6 users that have the same questionnaire
 * answers + user_profile as a template user — so they qualify for preview pool
 * (profile + you can add images separately).
 * Also ensures each pool candidate has non-null users.age (idempotent; never overwrites).
 *
 * After each candidate has a user_profile row, applies a fixed, slot-indexed small delta on
 * 1–2 G1R axes (same list as questionnaire G1R_PROFILE_KEYS), clamped to [0,1].
 * Idempotent: recomputed from the template profile each run; does not touch questionnaire_answers.
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

/** Deterministic ages 22–27 for slots 0–5; wide common prefs pass; distinct for static scoring smoke. */
function ageForPoolCandidateSlot(indexZeroBased) {
  return 22 + indexZeroBased;
}

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

/** Primary axis delta per slot i (0..5); secondary uses half this value. No randomness. */
const SLOT_PRIMARY_DELTA = [0.03, -0.03, 0.04, -0.04, 0.05, -0.05];

function clamp01(x) {
  return Math.min(1, Math.max(0, x));
}

/**
 * Slot i: nudge G1R_PROFILE_KEYS[i] by SLOT_PRIMARY_DELTA[i], and G1R_PROFILE_KEYS[(i+10)%20] by half that delta.
 * Values are taken from the template profile (clone source) so re-runs are deterministic.
 */
function buildG1rPerturbationData(templateProfile, slotIndex) {
  const primaryKey = G1R_PROFILE_KEYS[slotIndex];
  const secondaryKey = G1R_PROFILE_KEYS[(slotIndex + 10) % 20];
  const d = SLOT_PRIMARY_DELTA[slotIndex];
  const data = {};

  const baseP = templateProfile[primaryKey];
  if (typeof baseP === "number") {
    data[primaryKey] = clamp01(baseP + d);
  }

  if (secondaryKey !== primaryKey) {
    const baseS = templateProfile[secondaryKey];
    if (typeof baseS === "number") {
      data[secondaryKey] = clamp01(baseS + d * 0.5);
    }
  }

  return data;
}

async function applyG1rPerturbationToCandidate(prisma, templateProfile, userId, slotIndex) {
  const data = buildG1rPerturbationData(templateProfile, slotIndex);
  const keys = Object.keys(data);
  if (keys.length === 0) {
    console.warn(
      "  [g1r perturb] skip: template has no numeric values on expected axes for slot",
      slotIndex,
    );
    return;
  }
  await prisma.userProfile.update({
    where: { userId },
    data,
  });
  const pk = G1R_PROFILE_KEYS[slotIndex];
  const sk = G1R_PROFILE_KEYS[(slotIndex + 10) % 20];
  console.log(
    "  [g1r perturb] slot",
    slotIndex,
    "axes",
    pk,
    sk !== pk ? sk : "(same)",
    "deltas",
    SLOT_PRIMARY_DELTA[slotIndex],
    "/",
    SLOT_PRIMARY_DELTA[slotIndex] * 0.5,
  );
}

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
      const slotAge = ageForPoolCandidateSlot(i);
      if (!user) {
        user = await prisma.user.create({
          data: {
            phone,
            nickname,
            age: slotAge,
          },
        });
        console.log("[create user]", user.id, phone, "age=", slotAge);
      } else {
        console.log("[existing user]", user.id, phone);
        if (user.age == null) {
          await prisma.user.update({
            where: { id: user.id },
            data: { age: slotAge },
          });
          console.log("  [backfill age]", user.id, slotAge);
        } else {
          console.log("  skip age (already set):", user.id, "age=", user.age);
        }
      }

      const hasProfile = await prisma.userProfile.findUnique({
        where: { userId: user.id },
      });

      if (hasProfile) {
        console.log("  skip (already has user_profile):", user.id);
        await applyG1rPerturbationToCandidate(
          prisma,
          template.relationProfile,
          user.id,
          i,
        );
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
      await applyG1rPerturbationToCandidate(
        prisma,
        template.relationProfile,
        user.id,
        i,
      );
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
