import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { parseP75R4HImportCandidateImagesCliArgs } from "../src/dev-cli/p75-r4-h-import-candidate-images-cli-args";
import {
  assertR4HCandidateImportReportPrivacySafe,
  CandidateImageDevImportService,
  isDemoR4hSeedPhone,
  maskUserIdForR4hImportDebug,
} from "../src/modules/dev/candidate-image-dev-import.service";
import {
  buildImportPlan,
  isSupportedImageBasename,
  listEligibleImageFiles,
  parseCandidateMappingJson,
  parseMappingItemGender,
} from "../src/modules/dev/p75-r4-h-candidate-image-import.plan";
import {
  isCandidateImportFolderRelativeToCwd,
  resolveCandidateImportFolderInput,
} from "../src/modules/dev/repo-root";

describe("P7.5-r4-h candidate image import (plan + CLI)", () => {
  it("isDemoR4hSeedPhone marks only demo-r4h prefixed phones", () => {
    expect(isDemoR4hSeedPhone("demo-r4h-cmoc1gnil00006z64l9w2oa5t")).toBe(true);
    expect(isDemoR4hSeedPhone("demo-r4h-auto-deadbeef")).toBe(true);
    expect(isDemoR4hSeedPhone("+8613812345678")).toBe(false);
    expect(isDemoR4hSeedPhone(null)).toBe(false);
  });

  it("parseCandidateMappingJson reads mapping items", () => {
    const m = parseCandidateMappingJson(
      JSON.stringify({
        version: 1,
        items: [{ file: "x.jpg", userId: "u1" }],
      }),
    );
    expect(m?.items?.[0]?.file).toBe("x.jpg");
    expect(parseCandidateMappingJson("{}")).toBe(null);
    expect(parseCandidateMappingJson("noop")).toBe(null);
  });

  it("isSupportedImageBasename rejects gif and dotfiles", () => {
    expect(isSupportedImageBasename("a.jpg")).toBe(true);
    expect(isSupportedImageBasename("b.JPEG")).toBe(true);
    expect(isSupportedImageBasename(".hidden.jpg")).toBe(false);
    expect(isSupportedImageBasename("z.gif")).toBe(false);
  });

  it("listEligibleImageFiles skips mapping.json and non-images", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "r4h-"));
    await fs.writeFile(path.join(dir, "a.JPG"), new Uint8Array([1]));
    await fs.writeFile(path.join(dir, "mapping.json"), "{}");
    await fs.writeFile(path.join(dir, "readme.txt"), "x");
    const files = listEligibleImageFiles(dir);
    expect(files).toHaveLength(1);
    expect(path.basename(files[0]!)).toBe("a.JPG");

    await fs.rm(dir, { recursive: true });
  });

  it("parseMappingItemGender only accepts male/female", () => {
    expect(parseMappingItemGender("male")).toBe("male");
    expect(parseMappingItemGender("Female")).toBe("female");
    expect(parseMappingItemGender("unknown")).toBe("invalid");
    expect(parseMappingItemGender("alien")).toBe("invalid");
    expect(parseMappingItemGender(undefined)).toBe("invalid");
  });

  it("buildImportPlan attaches 1-based mapping source line indices", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "r4h-line"));
    await fs.writeFile(path.join(dir, "a.jpg"), new Uint8Array([1]));
    await fs.writeFile(path.join(dir, "b.jpg"), new Uint8Array([1]));
    const mapping = parseCandidateMappingJson(
      JSON.stringify({
        items: [
          { file: "a.jpg", userId: "u1", gender: "female" },
          { file: "b.jpg", userId: "u2", gender: "male" },
        ],
      }),
    )!;
    const plan = buildImportPlan({
      folderAbs: dir,
      mapping,
      tagPrefix: "d",
      limit: 10,
    });
    expect(plan.find((r) => r.sourceBasename === "a.jpg")!.mappingSourceLine1Based).toBe(1);
    expect(plan.find((r) => r.sourceBasename === "b.jpg")!.mappingSourceLine1Based).toBe(2);
    await fs.rm(dir, { recursive: true });
  });

  it("buildImportPlan reads mapping gender on items", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "r4h-g"));
    await fs.writeFile(path.join(dir, "g.jpg"), new Uint8Array([1]));
    const mapping = parseCandidateMappingJson(
      JSON.stringify({
        items: [
          {
            file: "g.jpg",
            userId: "u1",
            gender: "female",
          },
        ],
      }),
    )!;
    const plan = buildImportPlan({
      folderAbs: dir,
      mapping,
      tagPrefix: "demo",
      limit: 10,
    });
    expect(plan).toHaveLength(1);
    expect(plan[0]!.genderNormalized).toBe("female");
    await fs.rm(dir, { recursive: true });
  });

  it("buildImportPlan keeps one plan row per mapping line (same basename can repeat)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "r4h-dupmap-"));
    await fs.writeFile(path.join(dir, "shared.jpg"), new Uint8Array([1]));
    const mapping = parseCandidateMappingJson(
      JSON.stringify({
        items: [
          { file: "shared.jpg", userId: "u-a", gender: "female" },
          { file: "shared.jpg", userId: "u-b", gender: "female" },
        ],
      }),
    )!;
    const plan = buildImportPlan({
      folderAbs: dir,
      mapping,
      tagPrefix: "demo",
      limit: 10,
    });
    expect(plan).toHaveLength(2);
    expect(plan[0]!.mappingUserId).toBe("u-a");
    expect(plan[1]!.mappingUserId).toBe("u-b");
    await fs.rm(dir, { recursive: true });
  });

  it("buildImportPlan prefers mapping bindings then discovers unlisted files", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "r4h-mp-"));
    await fs.writeFile(path.join(dir, "m1.jpg"), new Uint8Array([1]));
    await fs.writeFile(path.join(dir, "extra.png"), new Uint8Array([1]));
    const mapping = parseCandidateMappingJson(
      JSON.stringify({
        items: [
          {
            file: "m1.jpg",
            userId: "mapped-u1",
            gender: "male",
          },
        ],
      }),
    )!;
    const plan = buildImportPlan({
      folderAbs: dir,
      mapping,
      tagPrefix: "demo",
      limit: 10,
    });
    expect(plan.map((p) => p.sourceBasename)).toEqual(["m1.jpg", "extra.png"]);
    const m1 = plan.find((p) => p.sourceBasename === "m1.jpg");
    expect(m1?.mappingUserId).toBe("mapped-u1");
    const ex = plan.find((p) => p.sourceBasename === "extra.png");
    expect(ex?.targetUserId).toBe("new");
    expect(ex?.genderNormalized).toBe("invalid");

    await fs.rm(dir, { recursive: true });
  });

  it("buildImportPlan marks mapping item without gender as invalid", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "r4h-nog-"));
    await fs.writeFile(path.join(dir, "ng.jpg"), new Uint8Array([1]));
    const mapping = parseCandidateMappingJson(
      JSON.stringify({
        items: [{ file: "ng.jpg", userId: "mapped-u99" }],
      }),
    )!;
    const plan = buildImportPlan({
      folderAbs: dir,
      mapping,
      tagPrefix: "demo",
      limit: 10,
    });
    expect(plan).toHaveLength(1);
    expect(plan[0]!.genderNormalized).toBe("invalid");
    await fs.rm(dir, { recursive: true });
  });

  it("resolveCandidateImportFolderInput: dev-assets path is monorepo-root relative (cwd=apps/api)", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "r4h-mr-"));
    const api = path.join(root, "apps", "api");
    await fs.mkdir(api, { recursive: true });
    await fs.writeFile(path.join(root, "pnpm-workspace.yaml"), "packages: []\n");
    const assetDir = path.join(root, "dev-assets", "test-user-images");
    await fs.mkdir(assetDir, { recursive: true });

    const fromRepoStyle = resolveCandidateImportFolderInput(
      "dev-assets/test-user-images",
      api,
    );
    expect(fromRepoStyle).toBe(path.normalize(assetDir));

    const fromParentSegments = resolveCandidateImportFolderInput(
      "../../dev-assets/test-user-images",
      api,
    );
    expect(fromParentSegments).toBe(path.normalize(assetDir));

    await fs.rm(root, { recursive: true, force: true });
  });

  it("resolveCandidateImportFolderInput normalizes absolute folders", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "r4h-abs-"));
    const assetDir = path.join(root, "dev-assets", "test-user-images");
    await fs.mkdir(assetDir, { recursive: true });
    expect(resolveCandidateImportFolderInput(assetDir)).toBe(path.normalize(assetDir));
    await fs.rm(root, { recursive: true, force: true });
  });

  it("isCandidateImportFolderRelativeToCwd flags cwd-anchored CLI paths", () => {
    expect(isCandidateImportFolderRelativeToCwd("dev-assets/x")).toBe(false);
    expect(isCandidateImportFolderRelativeToCwd("../../dev-assets/x")).toBe(true);
    expect(isCandidateImportFolderRelativeToCwd(".\\sub")).toBe(true);
  });

  it("CLI defaults and bool parsing", () => {
    const d = parseP75R4HImportCandidateImagesCliArgs([]);
    expect(d.folder).toBe("dev-assets/test-user-images");
    expect(d.dryRun).toBe(true);
    expect(d.copyToUploads).toBe(true);
    expect(d.runDetection).toBe(true);
    expect(d.runVision).toBe(false);
    expect(
      parseP75R4HImportCandidateImagesCliArgs([
        "--dryRun=false",
        "--folder=custom",
      ]).dryRun,
    ).toBe(false);
    expect(
      parseP75R4HImportCandidateImagesCliArgs(["--debugBlockedRows=true"])
        .debugBlockedRows,
    ).toBe(true);
    expect(parseP75R4HImportCandidateImagesCliArgs([]).debugBlockedRows).toBe(
      undefined,
    );
  });

  it("maskUserIdForR4hImportDebug shortens typical cuids without exposing full id", () => {
    expect(maskUserIdForR4hImportDebug("abcdefgh")).toBe("…");
    expect(maskUserIdForR4hImportDebug("abcdefghi")).toBe("abcd…fghi");
    expect(maskUserIdForR4hImportDebug("cmzzzzzzzzzend")).toBe("cmzz…zend");
  });

  it("privacy assert rejects leakage tokens", () => {
    assertR4HCandidateImportReportPrivacySafe("{}");
    expect(() =>
      assertR4HCandidateImportReportPrivacySafe('{"reviewNote":"x"}'),
    ).toThrow();
    expect(() =>
      assertR4HCandidateImportReportPrivacySafe(
        '{"x":"nested","detectionScoreJson":{"a":1}}',
      ),
    ).toThrow();
  });

  it("P7.5-r4-o1: repo dev-assets demo mapping parses genders consistent with onboarding preview requirements", async () => {
    const repoMappingPath = path.join(
      __dirname,
      "../../../dev-assets/test-user-images/mapping.json",
    );
    const parsed = parseCandidateMappingJson(
      fsSync.readFileSync(repoMappingPath, "utf8"),
    );
    expect(parsed?.items?.length).toBe(12);
    const genders = parsed!.items!.map((x) => parseMappingItemGender(x.gender));
    expect(genders.filter((x) => x !== "female" && x !== "male")).toHaveLength(0);
    expect(genders.filter((x) => x === "female").length).toBeGreaterThanOrEqual(6);
    expect(repoMappingPath).toMatch(/mapping\.json$/);
  });

  it("dryRun does not call detection or write uploads", async () => {
    const uploadTmp = await fs.mkdtemp(path.join(os.tmpdir(), "r4h-upl-"));
    const prevUpload = process.env.UPLOAD_DIR;
    process.env.UPLOAD_DIR = uploadTmp;
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "r4h-dry-"));
    try {
      const prisma = {
        userImage: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
        user: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn(),
          findMany: jest.fn(),
        },
        userProfile: { upsert: jest.fn() },
      };

      const detection = {
        detectFromBuffer: jest.fn(),
      };

      const vision = {
        applyToDetectionScoreJson: jest.fn((x: unknown) => x),
      };

      const svc = new CandidateImageDevImportService(
        prisma as never,
        detection as never,
        vision as never,
      );

      await fs.writeFile(path.join(dir, "z.jpg"), new Uint8Array([1]));

      const report = await svc.run({
        folderRelOrAbs: dir,
        limit: 5,
        dryRun: true,
        createMissingUsers: true,
        copyToUploads: true,
        tagPrefix: "demo",
        runDetection: true,
        runVision: false,
      });

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(detection.detectFromBuffer).not.toHaveBeenCalled();
      expect(report.summary.createdUserImages).toBe(0);
      expect(report.summary.createdUsers).toBe(0);
      expect(report.summary.eligibleImages).toBe(1);
      expect(report.summary.wouldCreateUsers).toBe(0);
      expect(report.summary.wouldCreateUserImages).toBe(0);
      expect(report.summary.maleCandidates).toBe(0);
      expect(report.summary.femaleCandidates).toBe(0);
      expect(report.summary.invalidGenderCandidates).toBe(1);
      expect(report.summary.skippedInvalidGender).toBe(1);
    } finally {
      if (prevUpload === undefined) {
        delete process.env.UPLOAD_DIR;
      } else {
        process.env.UPLOAD_DIR = prevUpload;
      }
      await fs.rm(uploadTmp, { recursive: true, force: true });
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("write path creates UserImage with uploads URL and detection fields (mocked)", async () => {
    const uploadTmp = await fs.mkdtemp(path.join(os.tmpdir(), "r4h-upl-w-"));
    const prevUpload = process.env.UPLOAD_DIR;
    process.env.UPLOAD_DIR = uploadTmp;
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "r4h-wr-"));
    try {
      const created: unknown[] = [];
      const prisma = {
        userImage: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation(async ({ data }: { data: { imageUrl: string } }) => {
            created.push(data);
            return { id: "img-1", ...data };
          }),
        },
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: "u-mapped",
            phone: "demo-r4h-u-mapped",
            nickname: "n",
          }),
          create: jest.fn(),
          update: jest.fn().mockResolvedValue({}),
        },
        userProfile: { upsert: jest.fn().mockResolvedValue({}) },
      };

      const detection = {
        detectFromBuffer: jest.fn().mockResolvedValue({
          status: "passed",
          reasonCodes: [],
          scoreJson: { quality: {}, pipeline: ["quality"] },
          rulesVersion: "r1a",
        }),
      };

      const vision = {
        applyToDetectionScoreJson: jest.fn((x: unknown) => x),
      };

      const svc = new CandidateImageDevImportService(
        prisma as never,
        detection as never,
        vision as never,
      );

      await fs.writeFile(path.join(dir, "only.jpg"), new Uint8Array([9]));
      await fs.writeFile(
        path.join(dir, "mapping.json"),
        JSON.stringify({
          version: 1,
          publicBaseUrl: "http://127.0.0.1:3000",
          items: [{ file: "only.jpg", userId: "u-mapped", gender: "female" }],
        }),
        "utf8",
      );

      const report = await svc.run({
        folderRelOrAbs: dir,
        limit: 5,
        dryRun: false,
        createMissingUsers: true,
        copyToUploads: true,
        tagPrefix: "demo",
        runDetection: true,
        runVision: false,
      });

      expect(report.summary.createdUserImages).toBe(1);
      expect(report.summary.detectionPassed).toBe(1);
      expect(report.summary.femaleCandidates).toBe(1);
      expect(report.summary.maleCandidates).toBe(0);
      expect(report.summary.invalidGenderCandidates).toBe(0);
      expect(report.summary.skippedInvalidGender).toBe(0);
      expect(prisma.userImage.create).toHaveBeenCalled();
      const row = created[0] as { imageUrl: string; detectionScoreJson: unknown };
      expect(row.imageUrl).toContain("/uploads/user-images/");
      expect(row.imageUrl).toContain("u-mapped-");
      expect(row.imageUrl).toMatch(/-r4h-uu-mapped--/);
      expect(row.detectionScoreJson).toBeDefined();
      expect(detection.detectFromBuffer).toHaveBeenCalled();
      expect(JSON.stringify(report).includes("reviewNote")).toBe(false);
    } finally {
      if (prevUpload === undefined) {
        delete process.env.UPLOAD_DIR;
      } else {
        process.env.UPLOAD_DIR = prevUpload;
      }
      await fs.rm(uploadTmp, { recursive: true, force: true });
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("non-demo-phone mapped ids fail without UserImage.insert", async () => {
    const uploadTmp = await fs.mkdtemp(path.join(os.tmpdir(), "r4h-upl-real-"));
    const prevUpload = process.env.UPLOAD_DIR;
    process.env.UPLOAD_DIR = uploadTmp;
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "r4h-real-"));
    try {
      const prisma = {
        userImage: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
        user: {
          findUnique: jest.fn().mockImplementation((args: { select?: unknown }) => {
            if (args.select && "phone" in (args.select as object)) {
              return Promise.resolve({ phone: "+8613912345678" });
            }
            return Promise.resolve({ id: "u-real-mapped", phone: "+8613912345678" });
          }),
          create: jest.fn(),
          update: jest.fn(),
        },
        userProfile: { upsert: jest.fn() },
      };
      const detection = { detectFromBuffer: jest.fn() };
      const vision = {
        applyToDetectionScoreJson: jest.fn((x: unknown) => x),
      };
      const svc = new CandidateImageDevImportService(
        prisma as never,
        detection as never,
        vision as never,
      );
      await fs.writeFile(path.join(dir, "x.jpg"), new Uint8Array([3]));
      await fs.writeFile(
        path.join(dir, "mapping.json"),
        JSON.stringify({
          items: [{ file: "x.jpg", userId: "u-real-mapped", gender: "male" }],
        }),
      );
      const report = await svc.run({
        folderRelOrAbs: dir,
        limit: 5,
        dryRun: false,
        createMissingUsers: true,
        copyToUploads: true,
        tagPrefix: "demo",
        runDetection: true,
        runVision: false,
        debugBlockedRows: true,
      });
      expect(report.summary.failed).toBeGreaterThanOrEqual(1);
      expect(report.summary.failureReasons.non_demo_user_blocked).toBeGreaterThanOrEqual(
        1,
      );
      expect(report.summary.createdUserImages).toBe(0);
      expect(prisma.userImage.create).not.toHaveBeenCalled();
      expect(report.debug?.nonDemoBlockedRows).toHaveLength(1);
      expect(report.debug!.nonDemoBlockedRows[0]!.reasonCode).toBe(
        "non_demo_user_blocked",
      );
      expect(report.debug!.nonDemoBlockedRows[0]!.mappingLine1Based).toBe(1);
      expect(report.debug!.nonDemoBlockedRows[0]!.maskedUserId).toMatch(/u-re…pped/);
      assertR4HCandidateImportReportPrivacySafe(JSON.stringify(report));
    } finally {
      if (prevUpload === undefined) {
        delete process.env.UPLOAD_DIR;
      } else {
        process.env.UPLOAD_DIR = prevUpload;
      }
      await fs.rm(uploadTmp, { recursive: true, force: true });
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("rerun merges gender/profile then skips duplicate UserImage for same dedup slug", async () => {
    const uploadTmp = await fs.mkdtemp(path.join(os.tmpdir(), "r4h-upl-dup-"));
    const prevUpload = process.env.UPLOAD_DIR;
    process.env.UPLOAD_DIR = uploadTmp;
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "r4h-dup-"));
    try {
      const prisma = {
        userImage: {
          findFirst: jest.fn().mockResolvedValue({ id: "already" }),
          create: jest.fn(),
        },
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: "u-mapped-dup",
            phone: "demo-r4h-u-mapped-dup",
          }),
          create: jest.fn(),
          update: jest.fn().mockResolvedValue({}),
        },
        userProfile: { upsert: jest.fn().mockResolvedValue({}) },
      };
      const detection = { detectFromBuffer: jest.fn() };
      const vision = {
        applyToDetectionScoreJson: jest.fn((x: unknown) => x),
      };
      const svc = new CandidateImageDevImportService(
        prisma as never,
        detection as never,
        vision as never,
      );
      await fs.writeFile(path.join(dir, "dupslug.jpg"), new Uint8Array([4]));
      await fs.writeFile(
        path.join(dir, "mapping.json"),
        JSON.stringify({
          items: [
            {
              file: "dupslug.jpg",
              userId: "u-mapped-dup",
              gender: "female",
            },
          ],
        }),
      );
      const report = await svc.run({
        folderRelOrAbs: dir,
        limit: 5,
        dryRun: false,
        createMissingUsers: true,
        copyToUploads: true,
        tagPrefix: "demo",
        runDetection: true,
        runVision: false,
      });
      expect(report.summary.createdUserImages).toBe(0);
      expect(report.summary.skippedExisting).toBe(1);
      expect(report.summary.skippedExistingUserImportImage).toBe(1);
      expect(report.summary.femaleCandidates).toBe(1);
      expect(prisma.user.update).toHaveBeenCalled();
      expect(prisma.userProfile.upsert).toHaveBeenCalled();
      expect(detection.detectFromBuffer).not.toHaveBeenCalled();
      expect(prisma.userImage.create).not.toHaveBeenCalled();
    } finally {
      if (prevUpload === undefined) {
        delete process.env.UPLOAD_DIR;
      } else {
        process.env.UPLOAD_DIR = prevUpload;
      }
      await fs.rm(uploadTmp, { recursive: true, force: true });
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("two mapped demo users reusing the same source file each get a UserImage", async () => {
    const uploadTmp = await fs.mkdtemp(path.join(os.tmpdir(), "r4h-upl-2u-"));
    const prevUpload = process.env.UPLOAD_DIR;
    process.env.UPLOAD_DIR = uploadTmp;
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "r4h-2u-"));
    try {
      const created: { userId: string; imageUrl: string }[] = [];
      const prisma = {
        userImage: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation(
            async ({
              data,
            }: {
              data: { userId: string; imageUrl: string };
            }) => {
              created.push({ userId: data.userId, imageUrl: data.imageUrl });
              return { id: "img", ...data };
            },
          ),
        },
        user: {
          findUnique: jest
            .fn()
            .mockImplementation(
              (args: {
                where: { id: string };
                select?: { phone?: boolean; id?: boolean };
              }) => {
                const { id } = args.where;
                if (args.select?.phone && !args.select?.id) {
                  return Promise.resolve({ phone: `demo-r4h-${id}` });
                }
                return Promise.resolve({
                  id,
                  phone: `demo-r4h-${id}`,
                  nickname: "n",
                });
              },
            ),
          create: jest.fn(),
          update: jest.fn().mockResolvedValue({}),
        },
        userProfile: { upsert: jest.fn().mockResolvedValue({}) },
      };
      const detection = {
        detectFromBuffer: jest.fn().mockResolvedValue({
          status: "passed",
          reasonCodes: [],
          scoreJson: { quality: {}, pipeline: ["quality"] },
          rulesVersion: "r1a",
        }),
      };
      const vision = {
        applyToDetectionScoreJson: jest.fn((x: unknown) => x),
      };
      const svc = new CandidateImageDevImportService(
        prisma as never,
        detection as never,
        vision as never,
      );
      await fs.writeFile(path.join(dir, "reuse.jpg"), new Uint8Array([9]));
      await fs.writeFile(
        path.join(dir, "mapping.json"),
        JSON.stringify({
          version: 1,
          publicBaseUrl: "http://127.0.0.1:3000",
          items: [
            { file: "reuse.jpg", userId: "u-a", gender: "female" },
            { file: "reuse.jpg", userId: "u-b", gender: "female" },
          ],
        }),
        "utf8",
      );
      const report = await svc.run({
        folderRelOrAbs: dir,
        limit: 10,
        dryRun: false,
        createMissingUsers: true,
        copyToUploads: true,
        tagPrefix: "demo",
        runDetection: true,
        runVision: false,
      });
      expect(report.summary.createdUserImages).toBe(2);
      expect(report.summary.femaleCandidates).toBe(2);
      expect(report.summary.failureReasons).toEqual(
        expect.objectContaining({
          unexpected_error: 0,
          db_error: 0,
          copy_failed: 0,
        }),
      );
      expect(created.map((c) => c.userId).sort()).toEqual(["u-a", "u-b"]);
      expect(created[0]!.imageUrl).not.toBe(created[1]!.imageUrl);
      for (const [args] of (prisma.userImage.findFirst as jest.Mock).mock.calls) {
        expect((args as { where: { userId: string } }).where.userId).toBeTruthy();
      }
    } finally {
      if (prevUpload === undefined) {
        delete process.env.UPLOAD_DIR;
      } else {
        process.env.UPLOAD_DIR = prevUpload;
      }
      await fs.rm(uploadTmp, { recursive: true, force: true });
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("second full import skips UserImage insert but retains handled gender counts", async () => {
    const uploadTmp = await fs.mkdtemp(path.join(os.tmpdir(), "r4h-upl-twice"));
    const prevUpload = process.env.UPLOAD_DIR;
    process.env.UPLOAD_DIR = uploadTmp;
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "r4h-twice-"));
    let secondPhase = false;
    try {
      const prisma = {
        userImage: {
          findFirst: jest.fn().mockImplementation(() =>
            Promise.resolve(secondPhase ? { id: "prior" } : null),
          ),
          create: jest.fn().mockResolvedValue({ id: "new" }),
        },
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: "u-once",
            phone: "demo-r4h-u-once",
          }),
          create: jest.fn(),
          update: jest.fn().mockResolvedValue({}),
        },
        userProfile: { upsert: jest.fn().mockResolvedValue({}) },
      };
      const detection = {
        detectFromBuffer: jest.fn().mockResolvedValue({
          status: "passed",
          reasonCodes: [],
          scoreJson: { quality: {}, pipeline: ["quality"] },
          rulesVersion: "r1a",
        }),
      };
      const vision = {
        applyToDetectionScoreJson: jest.fn((x: unknown) => x),
      };
      const svc = new CandidateImageDevImportService(
        prisma as never,
        detection as never,
        vision as never,
      );
      await fs.writeFile(path.join(dir, "once.jpg"), new Uint8Array([9]));
      await fs.writeFile(
        path.join(dir, "mapping.json"),
        JSON.stringify({
          items: [{ file: "once.jpg", userId: "u-once", gender: "female" }],
        }),
        "utf8",
      );
      const r1 = await svc.run({
        folderRelOrAbs: dir,
        limit: 5,
        dryRun: false,
        createMissingUsers: true,
        copyToUploads: true,
        tagPrefix: "demo",
        runDetection: true,
        runVision: false,
      });
      secondPhase = true;
      const r2 = await svc.run({
        folderRelOrAbs: dir,
        limit: 5,
        dryRun: false,
        createMissingUsers: true,
        copyToUploads: true,
        tagPrefix: "demo",
        runDetection: true,
        runVision: false,
      });
      expect(r1.summary.createdUserImages).toBe(1);
      expect(r2.summary.createdUserImages).toBe(0);
      expect(r2.summary.femaleCandidates).toBe(1);
      expect(prisma.userImage.create).toHaveBeenCalledTimes(1);
    } finally {
      if (prevUpload === undefined) {
        delete process.env.UPLOAD_DIR;
      } else {
        process.env.UPLOAD_DIR = prevUpload;
      }
      await fs.rm(uploadTmp, { recursive: true, force: true });
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("P7.5-r4-n2: twelve createMissingUsers rows → 6M+6F; second run skips all images", async () => {
    const mkRowId = (n: number) =>
      `cmr4n2row${String(n).padStart(2, "0")}z64seed`.padEnd(25, "0");
    expect(mkRowId(1).length).toBe(25);

    const uploadTmp = await fs.mkdtemp(path.join(os.tmpdir(), "r4h-upl-12"));
    const prevUpload = process.env.UPLOAD_DIR;
    process.env.UPLOAD_DIR = uploadTmp;
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "r4h-12"));
    try {
      const createdUserIds = new Set<string>();
      const findFirstMock = jest.fn().mockResolvedValue(null);
      const prisma = {
        userImage: {
          findFirst: findFirstMock,
          create: jest.fn().mockResolvedValue({ id: "img" }),
        },
        user: {
          findUnique: jest
            .fn()
            .mockImplementation(
              (args: { where: { id: string }; select?: { phone?: boolean } }) => {
                const id = args.where.id;
                if (!args.select) {
                  return createdUserIds.has(id)
                    ? Promise.resolve({ id })
                    : Promise.resolve(null);
                }
                if (args.select.phone) {
                  return Promise.resolve({ phone: `demo-r4h-${id}` });
                }
                return Promise.resolve({ id });
              },
            ),
          create: jest.fn().mockImplementation((args: { data: { id: string } }) => {
            createdUserIds.add(args.data.id);
            return Promise.resolve(args.data);
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        userProfile: { upsert: jest.fn().mockResolvedValue({}) },
      };
      const detection = {
        detectFromBuffer: jest.fn().mockResolvedValue({
          status: "passed",
          reasonCodes: [],
          scoreJson: { quality: {}, pipeline: ["quality"] },
          rulesVersion: "r1a",
        }),
      };
      const vision = {
        applyToDetectionScoreJson: jest.fn((x: unknown) => x),
      };
      const svc = new CandidateImageDevImportService(
        prisma as never,
        detection as never,
        vision as never,
      );

      const items: { file: string; userId: string; gender: string }[] = [];
      for (let i = 1; i <= 12; i += 1) {
        const fn = `${i}.jpg`;
        await fs.writeFile(path.join(dir, fn), new Uint8Array([i]));
        items.push({
          file: fn,
          userId: mkRowId(i),
          gender: i % 2 === 1 ? "female" : "male",
        });
      }
      await fs.writeFile(
        path.join(dir, "mapping.json"),
        JSON.stringify({ version: 1, items }),
        "utf8",
      );

      const r1 = await svc.run({
        folderRelOrAbs: dir,
        limit: 20,
        dryRun: false,
        createMissingUsers: true,
        copyToUploads: true,
        tagPrefix: "demo",
        runDetection: true,
        runVision: false,
      });
      expect(r1.summary.failed).toBe(0);
      expect(r1.summary.maleCandidates).toBe(6);
      expect(r1.summary.femaleCandidates).toBe(6);
      expect(r1.summary.ensuredProfiles).toBe(12);
      expect(r1.summary.createdUserImages).toBe(12);
      expect(r1.summary.eligibleImages).toBe(12);
      expect(prisma.user.create).toHaveBeenCalledTimes(12);

      findFirstMock.mockResolvedValue({ id: "prior" });
      const r2 = await svc.run({
        folderRelOrAbs: dir,
        limit: 20,
        dryRun: false,
        createMissingUsers: true,
        copyToUploads: true,
        tagPrefix: "demo",
        runDetection: true,
        runVision: false,
      });
      expect(r2.summary.failed).toBe(0);
      expect(r2.summary.createdUserImages).toBe(0);
      expect(r2.summary.skippedExistingUserImportImage).toBe(12);
      expect(r2.summary.maleCandidates).toBe(6);
      expect(r2.summary.femaleCandidates).toBe(6);
      expect(r2.summary.ensuredProfiles).toBe(12);
      expect(prisma.userImage.create).toHaveBeenCalledTimes(12);
    } finally {
      if (prevUpload === undefined) {
        delete process.env.UPLOAD_DIR;
      } else {
        process.env.UPLOAD_DIR = prevUpload;
      }
      await fs.rm(uploadTmp, { recursive: true, force: true });
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("write skips invalid gender rows without creating user or UserImage", async () => {
    const uploadTmp = await fs.mkdtemp(path.join(os.tmpdir(), "r4h-upl-bad-"));
    const prevUpload = process.env.UPLOAD_DIR;
    process.env.UPLOAD_DIR = uploadTmp;
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "r4h-badg-"));
    try {
      const prisma = {
        userImage: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn(),
        },
        user: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn(),
          update: jest.fn(),
        },
        userProfile: { upsert: jest.fn() },
      };
      const detection = { detectFromBuffer: jest.fn() };
      const vision = {
        applyToDetectionScoreJson: jest.fn((x: unknown) => x),
      };
      const svc = new CandidateImageDevImportService(
        prisma as never,
        detection as never,
        vision as never,
      );
      await fs.writeFile(path.join(dir, "bad.jpg"), new Uint8Array([2]));
      await fs.writeFile(
        path.join(dir, "mapping.json"),
        JSON.stringify({
          items: [{ file: "bad.jpg", userId: "u-bad-map", gender: "alien" }],
        }),
      );
      const report = await svc.run({
        folderRelOrAbs: dir,
        limit: 5,
        dryRun: false,
        createMissingUsers: true,
        copyToUploads: true,
        tagPrefix: "demo",
        runDetection: true,
        runVision: false,
      });
      expect(report.summary.invalidGenderCandidates).toBe(1);
      expect(report.summary.skippedInvalidGender).toBe(1);
      expect(report.summary.createdUserImages).toBe(0);
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.userImage.create).not.toHaveBeenCalled();
    } finally {
      if (prevUpload === undefined) {
        delete process.env.UPLOAD_DIR;
      } else {
        process.env.UPLOAD_DIR = prevUpload;
      }
      await fs.rm(uploadTmp, { recursive: true, force: true });
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
