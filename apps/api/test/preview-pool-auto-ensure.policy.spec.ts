import {
  isPreviewPoolAutoEnsureEnabled,
  isPreviewPoolAutoEnsureSyntheticFallbackEnabled,
} from "../src/modules/preview-pool/preview-pool-auto-ensure.policy";

describe("preview-pool-auto-ensure.policy", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.PEIMA_PREVIEW_POOL_AUTO_ENSURE_ENABLED;
    delete process.env.PEIMA_PREVIEW_POOL_AUTO_ENSURE_DISABLED;
    delete process.env.PEIMA_PREVIEW_POOL_AUTO_ENSURE_SYNTHETIC_FALLBACK;
    delete process.env.PEIMA_PREVIEW_POOL_AUTO_ENSURE_SYNTHETIC_DISABLED;
  });

  afterAll(() => {
    process.env = env;
  });

  it("enables auto ensure by default", () => {
    expect(isPreviewPoolAutoEnsureEnabled()).toBe(true);
  });

  it("disables auto ensure when DISABLED=1", () => {
    process.env.PEIMA_PREVIEW_POOL_AUTO_ENSURE_DISABLED = "1";
    expect(isPreviewPoolAutoEnsureEnabled()).toBe(false);
  });

  it("enables synthetic fallback by default", () => {
    expect(isPreviewPoolAutoEnsureSyntheticFallbackEnabled()).toBe(true);
  });
});
