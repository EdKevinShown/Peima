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
  listEligibleImageFiles,
  parseCandidateMappingJson,
  r4hDedupMarkerInStoredName,
  slugForImportFilename,
  type PlannedImportRow,
} from "./p75-r4-h-candidate-image-import.plan";
import { resolveMonorepoRoot } from "./repo-root";

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
};

export type R4HCandidateImageImportSummary = {
  filesScanned: number;
  eligibleImages: number;
  wouldCreateUsers: number;
  wouldCreateUserImages: number;
  createdUsers: number;
  createdUserImages: number;
  detectionPassed: number;
  detectionSkipped: number;
  detectionFailed: number;
  skippedExisting: number;
  failed: number;
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
  };
  summary: R4HCandidateImageImportSummary;
};

const DEMO_FIELDS = {
  gender: "",
  age: 28 as number | null,
  city: "上海",
  height: 170 as number | null,
  education: "本科",
  occupation: "工程师",
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
    if (path.isAbsolute(folderRelOrAbs)) {
      return path.normalize(folderRelOrAbs);
    }
    const root = resolveMonorepoRoot();
    return path.normalize(path.join(root, folderRelOrAbs));
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

  private peekMappedUserExistence(mappingUserId: string): Promise<boolean> {
    return this.prisma.user
      .findUnique({ where: { id: mappingUserId } })
      .then((u) => Boolean(u));
  }

  private async createMappedUserOnce(
    row: PlannedImportRow,
    opts: R4HCandidateImageImportInput,
    summary: R4HCandidateImageImportSummary,
  ): Promise<boolean> {
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
      },
    });
    await this.ensureUserProfile(id);
    summary.createdUsers += 1;
    return true;
  }

  private async createAnonymousUserOnce(
    row: PlannedImportRow,
    opts: R4HCandidateImageImportInput,
    summary: R4HCandidateImageImportSummary,
  ): Promise<string> {
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
      },
    });
    await this.ensureUserProfile(created.id);
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
    let drySkippedDup = 0;
    let dryFailed = 0;

    const summary: R4HCandidateImageImportSummary = {
      filesScanned: scanned,
      eligibleImages: plan.length,
      wouldCreateUsers: 0,
      wouldCreateUserImages: 0,
      createdUsers: 0,
      createdUserImages: 0,
      detectionPassed: 0,
      detectionSkipped: 0,
      detectionFailed: 0,
      skippedExisting: 0,
      failed: 0,
    };

    if (opts.dryRun) {
      for (const row of plan) {
        const ext = extForStoredName(row.sourceBasename);
        if (!ext) {
          dryFailed += 1;
          continue;
        }
        const slug = slugForImportFilename(row.sourceBasename);
        const dedupMarker = r4hDedupMarkerInStoredName(slug);

        if (
          row.targetUserId === "from-mapping" &&
          row.mappingUserId &&
          opts.excludeUserId &&
          row.mappingUserId === opts.excludeUserId
        ) {
          drySkippedDup += 1;
          continue;
        }

        const dup = await this.prisma.userImage.findFirst({
          where: { imageUrl: { contains: dedupMarker } },
          select: { id: true },
        });
        if (dup) {
          drySkippedDup += 1;
          continue;
        }

        if (row.targetUserId === "from-mapping" && row.mappingUserId) {
          const exists = await this.peekMappedUserExistence(row.mappingUserId);
          if (!exists) {
            if (!opts.createMissingUsers) {
              dryFailed += 1;
              continue;
            }
            mappedUsersNeeded.add(row.mappingUserId);
          }
        } else {
          wouldCreateDistinctNewAnonymousUsers += 1;
        }

        wouldImages += 1;
      }

      summary.wouldCreateUsers =
        mappedUsersNeeded.size + wouldCreateDistinctNewAnonymousUsers;
      summary.wouldCreateUserImages = wouldImages;
      summary.skippedExisting = drySkippedDup;
      summary.failed = dryFailed;

      const report: R4HCandidateImageImportReport = {
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
        },
        summary,
      };

      assertR4HCandidateImportReportPrivacySafe(JSON.stringify(report));
      return report;
    }

    const mappedCreated = new Set<string>();

    for (const row of plan) {
      try {
        const ext = extForStoredName(row.sourceBasename);
        if (!ext) {
          summary.failed += 1;
          continue;
        }

        const slug = slugForImportFilename(row.sourceBasename);
        const dedupMarker = r4hDedupMarkerInStoredName(slug);

        if (
          row.targetUserId === "from-mapping" &&
          row.mappingUserId &&
          opts.excludeUserId &&
          row.mappingUserId === opts.excludeUserId
        ) {
          summary.skippedExisting += 1;
          continue;
        }

        const dupGlob = await this.prisma.userImage.findFirst({
          where: { imageUrl: { contains: dedupMarker } },
          select: { id: true },
        });
        if (dupGlob) {
          summary.skippedExisting += 1;
          continue;
        }

        let userIdResolved: string | null = null;

        if (row.targetUserId === "from-mapping" && row.mappingUserId) {
          const mu = row.mappingUserId;
          const exists = await this.peekMappedUserExistence(mu);
          if (!exists) {
            if (!opts.createMissingUsers) {
              summary.failed += 1;
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
          continue;
        }

        if (opts.excludeUserId && userIdResolved === opts.excludeUserId) {
          summary.skippedExisting += 1;
          continue;
        }

        const buf = await readFile(row.absolutePath);

        let detection: UserImageDetectionResult;
        if (opts.runDetection) {
          detection = await this.userImageDetection.detectFromBuffer(buf);
        } else {
          detection = skippedDetectionResult(null);
        }

        const stored = `${userIdResolved}-${randomUUID()}${dedupMarker}${ext}`;
        const dest = path.join(this.uploadDir, stored);
        await writeFile(dest, buf);

        const imageUrl = `${publicBase}/uploads/user-images/${stored}`;

        const createFields = this.reviewAndDetectionCreateFields(
          detection,
          opts.runVision,
        );

        await this.prisma.userImage.create({
          data: {
            userId: userIdResolved,
            imageUrl,
            styleTags: row.styleTags,
            ...createFields,
          },
        });

        summary.createdUserImages += 1;
        if (detection.status === "passed") summary.detectionPassed += 1;
        else if (detection.status === "skipped") summary.detectionSkipped += 1;
        else if (detection.status === "failed") summary.detectionFailed += 1;
      } catch (e) {
        this.logger.warn(`r4-h import failed for ${row.sourceBasename}`, e as Error);
        summary.failed += 1;
      }
    }

    const report: R4HCandidateImageImportReport = {
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
      },
      summary,
    };
    assertR4HCandidateImportReportPrivacySafe(JSON.stringify(report));
    return report;
  }
}
