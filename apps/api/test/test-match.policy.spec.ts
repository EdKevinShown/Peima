import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import {
  assertCanSeedTestPreviewPool,
  assertCanTriggerTestMatch,
  canUserSeedTestPreviewPool,
  canUserTriggerTestMatch,
} from "../src/modules/test/test-match.policy";

describe("test-match.policy", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env = { ...envBackup };
  });

  afterAll(() => {
    process.env = envBackup;
  });

  describe("batch match allowlist", () => {
    it("returns true when enabled and user is allowlisted", () => {
      process.env.PEIMA_TEST_MATCH_ENABLED = "1";
      process.env.PEIMA_TEST_MATCH_DISABLED = "0";
      process.env.PEIMA_TEST_MATCH_USER_IDS = "u1,u2";
      expect(canUserTriggerTestMatch("u2")).toBe(true);
    });

    it("returns false when disabled by env", () => {
      process.env.PEIMA_TEST_MATCH_ENABLED = "1";
      process.env.PEIMA_TEST_MATCH_DISABLED = "1";
      process.env.PEIMA_TEST_MATCH_USER_IDS = "u1";
      expect(canUserTriggerTestMatch("u1")).toBe(false);
    });

    it("assert throws UnauthorizedException when user missing", () => {
      process.env.PEIMA_TEST_MATCH_ENABLED = "1";
      process.env.PEIMA_TEST_MATCH_USER_IDS = "u1";
      expect(() => assertCanTriggerTestMatch(undefined)).toThrow(
        UnauthorizedException,
      );
    });

    it("assert throws ForbiddenException when allowlist missing", () => {
      process.env.PEIMA_TEST_MATCH_ENABLED = "1";
      process.env.PEIMA_TEST_MATCH_USER_IDS = "";
      expect(() => assertCanTriggerTestMatch("u1")).toThrow(ForbiddenException);
    });
  });

  describe("preview pool seed allowlist", () => {
    it("returns true when enabled and user is allowlisted", () => {
      process.env.PEIMA_TEST_PREVIEW_POOL_SEED_ENABLED = "1";
      process.env.PEIMA_TEST_PREVIEW_POOL_SEED_DISABLED = "0";
      process.env.PEIMA_TEST_PREVIEW_POOL_SEED_USER_IDS = "u3 u4";
      expect(canUserSeedTestPreviewPool("u4")).toBe(true);
    });

    it("returns false when feature env is off", () => {
      process.env.PEIMA_TEST_PREVIEW_POOL_SEED_ENABLED = "0";
      process.env.PEIMA_TEST_PREVIEW_POOL_SEED_USER_IDS = "u3";
      expect(canUserSeedTestPreviewPool("u3")).toBe(false);
    });

    it("assert throws ForbiddenException when user not allowlisted", () => {
      process.env.PEIMA_TEST_PREVIEW_POOL_SEED_ENABLED = "1";
      process.env.PEIMA_TEST_PREVIEW_POOL_SEED_USER_IDS = "u3";
      expect(() => assertCanSeedTestPreviewPool("u4")).toThrow(
        ForbiddenException,
      );
    });
  });
});
