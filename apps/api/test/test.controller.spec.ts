import { Test } from "@nestjs/testing";
import { UnauthorizedException } from "@nestjs/common";
import { TestController } from "../src/modules/test/test.controller";
import { AdminService } from "../src/modules/admin/admin.service";
import { TestPreviewPoolSeedService } from "../src/modules/test/test-preview-pool-seed.service";

describe("TestController", () => {
  async function createModule() {
    return Test.createTestingModule({
      controllers: [TestController],
      providers: [
        {
          provide: AdminService,
          useValue: {
            runBatchMatchSubprocess: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: TestPreviewPoolSeedService,
          useValue: {
            seedLatestForUser: jest.fn().mockResolvedValue({
              previewPool: { id: "pool-1", status: "active" },
              items: [],
              shortlistContract: null,
            }),
          },
        },
      ],
    }).compile();
  }

  const envBackup = { ...process.env };
  beforeEach(() => {
    process.env = { ...envBackup };
  });
  afterAll(() => {
    process.env = envBackup;
  });

  it("matchingCapabilities returns both capability flags", async () => {
    process.env.PEIMA_TEST_MATCH_ENABLED = "1";
    process.env.PEIMA_TEST_MATCH_USER_IDS = "u1";
    process.env.PEIMA_TEST_MATCH_DISABLED = "0";
    process.env.PEIMA_TEST_PREVIEW_POOL_SEED_ENABLED = "1";
    process.env.PEIMA_TEST_PREVIEW_POOL_SEED_USER_IDS = "u1";
    process.env.PEIMA_TEST_PREVIEW_POOL_SEED_DISABLED = "0";

    const mod = await createModule();
    const c = mod.get(TestController);
    expect(c.matchingCapabilities({ user: { userId: "u1" } })).toEqual({
      testBatchMatchTrigger: true,
      testPreviewPoolSeed: true,
    });
  });

  it("runBatchOnce delegates to admin service", async () => {
    process.env.PEIMA_TEST_MATCH_ENABLED = "1";
    process.env.PEIMA_TEST_MATCH_USER_IDS = "u1";
    process.env.PEIMA_TEST_MATCH_DISABLED = "0";

    const mod = await createModule();
    const c = mod.get(TestController);
    const admin = mod.get(AdminService) as unknown as {
      runBatchMatchSubprocess: jest.Mock;
    };
    await expect(c.runBatchOnce({ user: { userId: "u1" } })).resolves.toEqual({
      ok: true,
    });
    expect(admin.runBatchMatchSubprocess).toHaveBeenCalledTimes(1);
  });

  it("seedLatestPreviewPool delegates to seed service", async () => {
    process.env.PEIMA_TEST_PREVIEW_POOL_SEED_ENABLED = "1";
    process.env.PEIMA_TEST_PREVIEW_POOL_SEED_USER_IDS = "u1";
    process.env.PEIMA_TEST_PREVIEW_POOL_SEED_DISABLED = "0";

    const mod = await createModule();
    const c = mod.get(TestController);
    const seedService = mod.get(TestPreviewPoolSeedService) as unknown as {
      seedLatestForUser: jest.Mock;
    };
    await c.seedLatestPreviewPool({ user: { userId: "u1" } });
    expect(seedService.seedLatestForUser).toHaveBeenCalledWith("u1");
  });

  it("matchingCapabilities throws when user is missing", async () => {
    const mod = await createModule();
    const c = mod.get(TestController);
    expect(() => c.matchingCapabilities({ user: {} } as never)).toThrow(
      UnauthorizedException,
    );
  });
});
