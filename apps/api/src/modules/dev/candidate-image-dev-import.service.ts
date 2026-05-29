/**
 * DEV-ONLY: import local folder images into User + UserImage for onboarding preview demos.
 */

import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@peima/database";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import * as path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { UserImageDetectionResult } from "../images/user-image-quality-detection";
import { skippedDetectionResult } from "../images/user-image-quality-detection";
import { UserImageDetectionService } from "../images/user-image-detection.service";
import { resolveUserImageReviewStateFromDetection } from "../images/user-image-review-status";
import { UserImageVisionSidecarService } from "../images/user-image-vision-sidecar.service";
import {
  R4_H_SCHEMA_VERSION,
  buildImportPlan,
  isPlannedImportGenderValid,
  listEligibleImageFiles,
  parseCandidateMappingJson,
  r4hDedupMarkerInStoredName,
  r4hPerUserImageDedupMarker,
  slugForImportFilename,
  type PlannedImportRow,
} from "./p75-r4-h-candidate-image-import.plan";
import { resolveCandidateImportFolderInput } from "./repo-root";
import { genderStorageFromBinary } from "../onboarding/onboarding-preview-gender";

export type R4HCandidateImageImportInput = {
  folderRelOrAbs: string;
  limit: number;
  dryRun: boolean;
  createMissingUsers: boolean;
  copyToUploads: boolean;
  tagPrefix: string;
  runDetection: boolean;
  runVision: boolean;
  excludeUserId?: string;
  /**
   * Dev CLI — when true, emitted report may attach `debug.nonDemoBlockedRows` (masked ids).
   */
  debugBlockedRows?: boolean;
};

/** Row blocked because mapped user lacks `demo-r4h*` seed phone — report-only debug payload */
export type R4HNonDemoBlockedDebugRow = {
  mappingLine1Based: number | null;
  file: string;
  gender: "male" | "female";
  maskedUserId: string;
  reasonCode: "non_demo_user_blocked";
};

/** Privacy-safe failure / issue codes (no PII). */
export type R4HImportFailureReasonKey =
  | "missing_file"
  | "invalid_extension"
  | "invalid_gender"
  | "viewer_excluded"
  | "non_demo_user_blocked"
  | "cannot_create_mapped_user"
  | "copy_failed"
  | "detection_failed"
  | "db_error"
  | "unexpected_error";

export type R4HImportFailureReasons = Record<R4HImportFailureReasonKey, number>;

export function emptyR4HImportFailureReasons(): R4HImportFailureReasons {
  return {
    missing_file: 0,
    invalid_extension: 0,
    invalid_gender: 0,
    viewer_excluded: 0,
    non_demo_user_blocked: 0,
    cannot_create_mapped_user: 0,
    copy_failed: 0,
    detection_failed: 0,
    db_error: 0,
    unexpected_error: 0,
  };
}

export type R4HCandidateImageImportSummary = {
  filesScanned: number;
  eligibleImages: number;
  wouldCreateUsers: number;
  wouldCreateUserImages: number;
  createdUsers: number;
  /** New UserImage rows created this run */
  createdUserImages: number;
  createdUserImagesMale: number;
  createdUserImagesFemale: number;
  /** Rows with valid demo gender merged + ensured profile this run */
  ensuredProfiles: number;
  detectionPassed: number;
  detectionSkipped: number;
  detectionFailed: number;
  skippedExisting: number;
  skippedViewerExcluded: number;
  /** Same user already had r4-h import marker for this file slug — no second row */
  skippedExistingUserImportImage: number;
  failed: number;
  /**
   * Valid mapping demo rows merged this run (including image dedup skips).
   * Not zeroed when only dedup skips images.
   */
  maleCandidates: number;
  femaleCandidates: number;
  invalidGenderCandidates: number;
  skippedInvalidGender: number;
  failureReasons: R4HImportFailureReasons;
};

export type R4HCandidateImageImportReport = {
  schemaVersion: typeof R4_H_SCHEMA_VERSION;
  generatedAt: string;
  input: {
    folder: string;
    dryRun: boolean;
    limit: number;
    copyToUploads: boolean;
    createMissingUsers: boolean;
    runDetection: boolean;
    runVision: boolean;
    tagPrefix?: string;
    debugBlockedRows?: true;
  };
  summary: R4HCandidateImageImportSummary;
  /** Present only when `debugBlockedRows` input is true *and* at least one row was blocked here. */
  debug?: {
    nonDemoBlockedRows: R4HNonDemoBlockedDebugRow[];
  };
};

const DEMO_FIELDS = {
  age: 28 as number | null,
  city: "上海",
  height: 170 as number | null,
  education: "本科",
  occupation: "制造业 / 工程 / 技术",
  relationshipGoal: "认真恋爱",
  bio: "",
} as const;

function demoPhoneForUserId(userId: string): string {
  return `demo-r4h-${userId}`;
}

function extForStoredName(sourceBasename: string): string | null {
  const ext = path.extname(sourceBasename).toLowerCase();
  if (ext === ".jpeg" || ext === ".jpg") return ".jpg";
  if (ext === ".png") return ".png";
  if (ext === ".webp") return ".webp";
  return null;
}

/** Omit secrets / heavyweight JSON from finalized stdout reports. */
export function assertR4HCandidateImportReportPrivacySafe(json: string): void {
  if (json.includes('"reviewNote"')) {
    throw new Error("import report leaked reviewNote");
  }
  if (json.includes('"detectionScoreJson"')) {
    throw new Error("import report leaked detectionScoreJson");
  }
  if (json.includes('"email"') || json.includes('"phone"')) {
    throw new Error("import report leaked PII fields");
  }
}

export function maskUserIdForR4hImportDebug(userId: string): string {
  const t = userId.trim();
  if (t.length <= 8) return "…";
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
}

function appendNonDemoBlockedDebug(
  out: R4HNonDemoBlockedDebugRow[] | undefined,
  row: PlannedImportRow & { genderNormalized: "male" | "female" },
  rawUserId: string,
): void {
  if (!out) return;
  out.push({
    mappingLine1Based: row.mappingSourceLine1Based ?? null,
    file: row.sourceBasename,
    gender: row.genderNormalized,
    maskedUserId: maskUserIdForR4hImportDebug(rawUserId),
    reasonCode: "non_demo_user_blocked",
  });
}

/** Demo candidate accounts created/overwritten only when `phone` starts with `demo-r4h`. */
export function isDemoR4hSeedPhone(phone: string | null | undefined): boolean {
  return typeof phone === "string" && phone.startsWith("demo-r4h");
}

@Injectable()
export class CandidateImageDevImportService {
  private readonly logger = new Logger(CandidateImageDevImportService.name);

  private readonly uploadDir =
    process.env.UPLOAD_DIR ??
    path.join(process.cwd(), "uploads", "user-images");

  constructor(
    private readonly prisma: PrismaService,
    private readonly userImageDetection: UserImageDetectionService,
    private readonly visionSidecar: UserImageVisionSidecarService,
  ) {
    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  resolveFolderPath(folderRelOrAbs: string): string {
    return resolveCandidateImportFolderInput(folderRelOrAbs, process.cwd());
  }

  private detectionScoreJsonForPersist(
    rawScoreJson: UserImageDetectionResult["scoreJson"],
    runVision: boolean,
  ): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (rawScoreJson === null || rawScoreJson === undefined) {
      return Prisma.JsonNull;
    }
    const merged = runVision
      ? this.visionSidecar.applyToDetectionScoreJson(rawScoreJson)
      : rawScoreJson;
    if (merged === null || merged === undefined) {
      return Prisma.JsonNull;
    }
    return merged as Prisma.InputJsonValue;
  }

  private reviewAndDetectionCreateFields(
    detection: UserImageDetectionResult,
    runVision: boolean,
  ) {
    const review = resolveUserImageReviewStateFromDetection({
      detectionStatus: detection.status,
      detectionReasonCodes: detection.reasonCodes,
      detectionScoreJson: detection.scoreJson,
    });
    return {
      detectionStatus: detection.status,
      detectionReasonCodes: detection.reasonCodes,
      detectionScoreJson: this.detectionScoreJsonForPersist(
        detection.scoreJson,
        runVision,
      ),
      detectionRulesVersion: detection.rulesVersion,
      detectedAt: new Date(),
      reviewStatus: review.reviewStatus,
      reviewReasonCodes: review.reviewReasonCodes,
    };
  }

  private async ensureUserProfile(userId: string): Promise<void> {
    await this.prisma.userProfile.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  /** Merge demo fields from mapping import; only mutates `demo-r4h*` seed users. */
  private async mergeDemoCandidateUserFields(
    userId: string,
    row: PlannedImportRow & { genderNormalized: "male" | "female" },
    summary: R4HCandidateImageImportSummary,
  ): Promise<boolean> {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true },
    });
    if (!isDemoR4hSeedPhone(existing?.phone)) {
      summary.failureReasons.non_demo_user_blocked += 1;
      return false;
    }
    const data: { gender?: string; nickname?: string } = {
      gender: genderStorageFromBinary(row.genderNormalized),
    };
    if (row.nicknameHint?.trim()) {
      data.nickname = row.nicknameHint.trim().slice(0, 40);
    }
    if (Object.keys(data).length > 0) {
      await this.prisma.user.update({ where: { id: userId }, data });
    }
    await this.ensureUserProfile(userId);
    return true;
  }

  private peekMappedUserExistence(mappingUserId: string): Promise<boolean> {
    return this.prisma.user
      .findUnique({ where: { id: mappingUserId } })
      .then((u) => Boolean(u));
  }

  private async findDupR4hUserImage(opts: {
    userId: string;
    slug: string;
  }): Promise<{ id: string } | null> {
    const scoped = r4hPerUserImageDedupMarker(opts.userId, opts.slug);
    const legacy = r4hDedupMarkerInStoredName(opts.slug);
    return this.prisma.userImage.findFirst({
      where: {
        userId: opts.userId,
        OR: [
          { imageUrl: { contains: scoped } },
          { imageUrl: { contains: legacy } },
        ],
      },
      select: { id: true },
    });
  }

  private async createMappedUserOnce(
    row: PlannedImportRow,
    opts: R4HCandidateImageImportInput,
    summary: R4HCandidateImageImportSummary,
  ): Promise<boolean> {
    if (!isPlannedImportGenderValid(row.genderNormalized)) {
      throw new InternalServerErrorException(
        "r4-h import: createMappedUserOnce called with invalid gender",
      );
    }
    const gn = row.genderNormalized;
    const id = row.mappingUserId!;
    const nick =
      row.nicknameHint?.trim() ||
      `${opts.tagPrefix}-${slugForImportFilename(row.sourceBasename)}`.slice(
        0,
        40,
      );
    await this.prisma.user.create({
      data: {
        id,
        phone: demoPhoneForUserId(id),
        nickname: nick,
        ...DEMO_FIELDS,
        gender: genderStorageFromBinary(gn),
      },
    });
    summary.createdUsers += 1;
    return true;
  }

  private async createAnonymousUserOnce(
    row: PlannedImportRow,
    opts: R4HCandidateImageImportInput,
    summary: R4HCandidateImageImportSummary,
  ): Promise<string> {
    if (!isPlannedImportGenderValid(row.genderNormalized)) {
      throw new InternalServerErrorException(
        "r4-h import: createAnonymousUserOnce called with invalid gender",
      );
    }
    const gn = row.genderNormalized;
    const nick =
      row.nicknameHint?.trim() ||
      `${opts.tagPrefix}-${slugForImportFilename(row.sourceBasename)}`.slice(
        0,
        40,
      );
    const created = await this.prisma.user.create({
      data: {
        phone: `demo-r4h-auto-${randomUUID().replace(/-/g, "").slice(0, 24)}`,
        nickname: nick.slice(0, 40),
        ...DEMO_FIELDS,
        gender: genderStorageFromBinary(gn),
      },
    });
    summary.createdUsers += 1;
    return created.id;
  }

  async run(opts: R4HCandidateImageImportInput): Promise<R4HCandidateImageImportReport> {
    const folderAbs = this.resolveFolderPath(opts.folderRelOrAbs);

    if (!existsSync(folderAbs)) {
      throw new InternalServerErrorException(
        `Candidate image folder missing: ${opts.folderRelOrAbs}`,
      );
    }

    if (!opts.copyToUploads && !opts.dryRun) {
      throw new InternalServerErrorException(
        "copyToUploads=false is not supported for non-dry runs (URLs must land under uploads).",
      );
    }

    const scanned = listEligibleImageFiles(folderAbs).length;

    let mappingRaw: string | null = null;
    const mappingPath = path.join(folderAbs, "mapping.json");
    if (existsSync(mappingPath)) {
      try {
        mappingRaw = await readFile(mappingPath, "utf8");
      } catch {
        mappingRaw = null;
      }
    }
    const mapping = mappingRaw ? parseCandidateMappingJson(mappingRaw) : null;

    const plan = buildImportPlan({
      folderAbs,
      mapping,
      tagPrefix: opts.tagPrefix,
      limit: opts.limit,
    });

    const publicBase =
      mapping?.publicBaseUrl?.trim()?.replace(/\/$/, "") ||
      process.env.PUBLIC_BASE_URL?.trim()?.replace(/\/$/, "") ||
      "http://127.0.0.1:3000";

    const mappedUsersNeeded = new Set<string>();
    let wouldCreateDistinctNewAnonymousUsers = 0;
    let wouldImages = 0;
    let dryFailed = 0;

    const failureReasons = emptyR4HImportFailureReasons();
    const summary: R4HCandidateImageImportSummary = {
      filesScanned: scanned,
      eligibleImages: plan.length,
      wouldCreateUsers: 0,
      wouldCreateUserImages: 0,
      createdUsers: 0,
      createdUserImages: 0,
      createdUserImagesMale: 0,
      createdUserImagesFemale: 0,
      ensuredProfiles: 0,
      detectionPassed: 0,
      detectionSkipped: 0,
      detectionFailed: 0,
      skippedExisting: 0,
      skippedViewerExcluded: 0,
      skippedExistingUserImportImage: 0,
      failed: 0,
      maleCandidates: 0,
      femaleCandidates: 0,
      invalidGenderCandidates: 0,
      skippedInvalidGender: 0,
      failureReasons,
    };

    const dbgBlockedRows = opts.debugBlockedRows
      ? ([] as R4HNonDemoBlockedDebugRow[])
      : undefined;

    const finalizeReport = (): R4HCandidateImageImportReport => ({
      schemaVersion: R4_H_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      input: {
        folder: opts.folderRelOrAbs,
        dryRun: opts.dryRun,
        limit: opts.limit,
        copyToUploads: opts.copyToUploads,
        createMissingUsers: opts.createMissingUsers,
        runDetection: opts.runDetection,
        runVision: opts.runVision,
        tagPrefix: opts.tagPrefix,
        ...(opts.debugBlockedRows ? { debugBlockedRows: true as const } : {}),
      },
      summary,
      ...(opts.debugBlockedRows &&
      dbgBlockedRows &&
      dbgBlockedRows.length > 0
        ? { debug: { nonDemoBlockedRows: dbgBlockedRows } }
        : {}),
    });

    const bumpCandidateHandled = (
      row: PlannedImportRow & { genderNormalized: "male" | "female" },
    ) => {
      if (row.genderNormalized === "male") summary.maleCandidates += 1;
      else summary.femaleCandidates += 1;
    };

    const unbumpCandidateHandled = (
      row: PlannedImportRow & { genderNormalized: "male" | "female" },
    ) => {
      if (row.genderNormalized === "male") {
        summary.maleCandidates = Math.max(0, summary.maleCandidates - 1);
      } else {
        summary.femaleCandidates = Math.max(0, summary.femaleCandidates - 1);
      }
    };

    const dryRunDedupBlocking = async (
      row: PlannedImportRow,
      slug: string,
    ): Promise<boolean> => {
      if (row.targetUserId === "from-mapping" && row.mappingUserId) {
        const uid = row.mappingUserId;
        const dup = await this.findDupR4hUserImage({ userId: uid, slug });
        return Boolean(dup);
      }
      return false;
    };

    if (opts.dryRun) {
      for (const row of plan) {
        if (row.sourceFileMissing) {
          dryFailed += 1;
          failureReasons.missing_file += 1;
          continue;
        }

        const ext = extForStoredName(row.sourceBasename);
        if (!ext) {
          dryFailed += 1;
          failureReasons.invalid_extension += 1;
          continue;
        }

        if (!isPlannedImportGenderValid(row.genderNormalized)) {
          summary.invalidGenderCandidates += 1;
          summary.skippedInvalidGender += 1;
          failureReasons.invalid_gender += 1;
          continue;
        }

        const gnRow =
          row as PlannedImportRow & { genderNormalized: "male" | "female" };
        const slug = slugForImportFilename(row.sourceBasename);

        if (
          row.targetUserId === "from-mapping" &&
          row.mappingUserId &&
          opts.excludeUserId &&
          row.mappingUserId === opts.excludeUserId
        ) {
          summary.skippedViewerExcluded += 1;
          failureReasons.viewer_excluded += 1;
          continue;
        }

        if (row.targetUserId === "from-mapping" && row.mappingUserId) {
          const mu = row.mappingUserId;
          const exists = await this.peekMappedUserExistence(mu);
          if (exists) {
            const p = await this.prisma.user.findUnique({
              where: { id: mu },
              select: { phone: true },
            });
            if (!isDemoR4hSeedPhone(p?.phone)) {
              dryFailed += 1;
              failureReasons.non_demo_user_blocked += 1;
              appendNonDemoBlockedDebug(dbgBlockedRows, gnRow, mu);
              continue;
            }
          }
          if (!exists) {
            if (!opts.createMissingUsers) {
              dryFailed += 1;
              failureReasons.cannot_create_mapped_user += 1;
              continue;
            }
            mappedUsersNeeded.add(mu);
          }
        } else {
          wouldCreateDistinctNewAnonymousUsers += 1;
        }

        bumpCandidateHandled(gnRow);

        if (await dryRunDedupBlocking(row, slug)) {
          summary.skippedExistingUserImportImage += 1;
          continue;
        }

        wouldImages += 1;
      }

      summary.wouldCreateUsers =
        mappedUsersNeeded.size + wouldCreateDistinctNewAnonymousUsers;
      summary.wouldCreateUserImages = wouldImages;
      summary.skippedExisting =
        summary.skippedViewerExcluded + summary.skippedExistingUserImportImage;
      summary.failed = dryFailed;
      summary.failureReasons = { ...failureReasons };

      const report = finalizeReport();
      assertR4HCandidateImportReportPrivacySafe(JSON.stringify(report));
      return report;
    }

    const mappedCreated = new Set<string>();

    for (const row of plan) {
      let rowHandledCounting = false;
      let gnRow:
        | (PlannedImportRow & { genderNormalized: "male" | "female" })
        | undefined;
      try {
        if (row.sourceFileMissing) {
          summary.failed += 1;
          summary.failureReasons.missing_file += 1;
          continue;
        }

        const ext = extForStoredName(row.sourceBasename);
        if (!ext) {
          summary.failed += 1;
          summary.failureReasons.invalid_extension += 1;
          continue;
        }

        if (!isPlannedImportGenderValid(row.genderNormalized)) {
          summary.invalidGenderCandidates += 1;
          summary.skippedInvalidGender += 1;
          summary.failureReasons.invalid_gender += 1;
          continue;
        }

        gnRow =
          row as PlannedImportRow & { genderNormalized: "male" | "female" };

        const slug = slugForImportFilename(row.sourceBasename);

        if (
          row.targetUserId === "from-mapping" &&
          row.mappingUserId &&
          opts.excludeUserId &&
          row.mappingUserId === opts.excludeUserId
        ) {
          summary.skippedViewerExcluded += 1;
          summary.skippedExisting += 1;
          summary.failureReasons.viewer_excluded += 1;
          continue;
        }

        let userIdResolved: string | null = null;

        if (row.targetUserId === "from-mapping" && row.mappingUserId) {
          const mu = row.mappingUserId;
          const exists = await this.peekMappedUserExistence(mu);
          if (exists) {
            const phoneRow = await this.prisma.user.findUnique({
              where: { id: mu },
              select: { phone: true },
            });
            if (!isDemoR4hSeedPhone(phoneRow?.phone)) {
              summary.failed += 1;
              summary.failureReasons.non_demo_user_blocked += 1;
              appendNonDemoBlockedDebug(dbgBlockedRows, gnRow!, mu);
              continue;
            }
          }
          if (!exists) {
            if (!opts.createMissingUsers) {
              summary.failed += 1;
              summary.failureReasons.cannot_create_mapped_user += 1;
              continue;
            }
            if (!mappedCreated.has(mu)) {
              await this.createMappedUserOnce(row, opts, summary);
              mappedCreated.add(mu);
            }
          }
          userIdResolved = mu;
        } else {
          userIdResolved = await this.createAnonymousUserOnce(row, opts, summary);
        }

        if (!userIdResolved) {
          summary.failed += 1;
          summary.failureReasons.unexpected_error += 1;
          continue;
        }

        if (opts.excludeUserId && userIdResolved === opts.excludeUserId) {
          summary.skippedViewerExcluded += 1;
          summary.skippedExisting += 1;
          summary.failureReasons.viewer_excluded += 1;
          continue;
        }

        const mergedOk = await this.mergeDemoCandidateUserFields(
          userIdResolved,
          gnRow!,
          summary,
        );
        if (!mergedOk) {
          summary.failed += 1;
          /* failureReasons.non_demo_user_blocked already bumped in mergeDemoCandidateUserFields */
          appendNonDemoBlockedDebug(dbgBlockedRows, gnRow!, userIdResolved);
          continue;
        }

        summary.ensuredProfiles += 1;

        bumpCandidateHandled(gnRow!);
        rowHandledCounting = true;

        const dupForUser = await this.findDupR4hUserImage({
          userId: userIdResolved,
          slug,
        });
        if (dupForUser) {
          summary.skippedExistingUserImportImage += 1;
          summary.skippedExisting += 1;
          continue;
        }

        let buf: Buffer;
        try {
          buf = await readFile(row.absolutePath);
        } catch {
          summary.failed += 1;
          summary.failureReasons.copy_failed += 1;
          if (rowHandledCounting) unbumpCandidateHandled(gnRow!);
          continue;
        }

        let detection: UserImageDetectionResult;
        try {
          if (opts.runDetection) {
            detection = await this.userImageDetection.detectFromBuffer(buf);
          } else {
            detection = skippedDetectionResult(null);
          }
        } catch {
          summary.failed += 1;
          summary.failureReasons.unexpected_error += 1;
          if (rowHandledCounting) unbumpCandidateHandled(gnRow!);
          continue;
        }

        const perUserMarker = r4hPerUserImageDedupMarker(userIdResolved, slug);
        const stored = `${userIdResolved}-${randomUUID()}${perUserMarker}${ext}`;
        try {
          await writeFile(path.join(this.uploadDir, stored), buf);
        } catch {
          summary.failed += 1;
          summary.failureReasons.copy_failed += 1;
          if (rowHandledCounting) unbumpCandidateHandled(gnRow!);
          continue;
        }

        const imageUrl = `${publicBase}/uploads/user-images/${stored}`;

        const createFields = this.reviewAndDetectionCreateFields(
          detection,
          opts.runVision,
        );

        try {
          await this.prisma.userImage.create({
            data: {
              userId: userIdResolved,
              imageUrl,
              styleTags: row.styleTags,
              ...createFields,
            },
          });
        } catch {
          summary.failed += 1;
          summary.failureReasons.db_error += 1;
          if (rowHandledCounting) unbumpCandidateHandled(gnRow!);
          continue;
        }

        summary.createdUserImages += 1;
        if (row.genderNormalized === "male") summary.createdUserImagesMale += 1;
        else summary.createdUserImagesFemale += 1;

        if (detection.status === "passed") summary.detectionPassed += 1;
        else if (detection.status === "skipped") summary.detectionSkipped += 1;
        else if (detection.status === "failed") {
          summary.detectionFailed += 1;
          summary.failureReasons.detection_failed += 1;
        }
      } catch (e) {
        this.logger.warn(`r4-h import failed for ${row.sourceBasename}`, e as Error);
        summary.failed += 1;
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
          summary.failureReasons.db_error += 1;
        } else {
          summary.failureReasons.unexpected_error += 1;
        }
        if (rowHandledCounting && gnRow) {
          unbumpCandidateHandled(gnRow);
        }
      }
    }

    const report = finalizeReport();
    assertR4HCandidateImportReportPrivacySafe(JSON.stringify(report));
    return report;
  }
}
