import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { parseP75R4HImportCandidateImagesCliArgs } from "../src/dev-cli/p75-r4-h-import-candidate-images-cli-args";
import {
  assertR4HCandidateImportReportPrivacySafe,
  CandidateImageDevImportService,
} from "../src/modules/dev/candidate-image-dev-import.service";
import {
  buildImportPlan,
  isSupportedImageBasename,
  listEligibleImageFiles,
  parseCandidateMappingJson,
} from "../src/modules/dev/p75-r4-h-candidate-image-import.plan";

describe("P7.5-r4-h candidate image import (plan + CLI)", () => {
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

  it("buildImportPlan prefers mapping bindings then discovers unlisted files", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "r4h-mp-"));
    await fs.writeFile(path.join(dir, "m1.jpg"), new Uint8Array([1]));
    await fs.writeFile(path.join(dir, "extra.png"), new Uint8Array([1]));
    const mapping = parseCandidateMappingJson(
      JSON.stringify({
        items: [{ file: "m1.jpg", userId: "mapped-u1" }],
      }),
    )!;
    const plan = buildImportPlan({
      folderAbs: dir,
      mapping,
      tagPrefix: "demo",
      limit: 10,
    });
    expect(plan.map((p) => p.sourceBasename).sort()).toEqual(["extra.png", "m1.jpg"]);
    const m1 = plan.find((p) => p.sourceBasename === "m1.jpg");
    expect(m1?.mappingUserId).toBe("mapped-u1");
    const ex = plan.find((p) => p.sourceBasename === "extra.png");
    expect(ex?.targetUserId).toBe("new");

    await fs.rm(dir, { recursive: true });
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
      expect(report.summary.wouldCreateUserImages).toBe(1);
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
            phone: "p",
            nickname: "n",
          }),
          create: jest.fn(),
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
          items: [{ file: "only.jpg", userId: "u-mapped" }],
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
      expect(prisma.userImage.create).toHaveBeenCalled();
      const row = created[0] as { imageUrl: string; detectionScoreJson: unknown };
      expect(row.imageUrl).toContain("/uploads/user-images/");
      expect(row.imageUrl).toContain("u-mapped-");
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
});
