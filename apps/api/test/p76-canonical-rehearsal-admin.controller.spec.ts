/**
 * P7.7-r3.4 — canonical rehearsal admin controller permission metadata.
 */
import { Permission } from "@peima/shared/constants";
import { REQUIRED_PERMISSION_KEY } from "../src/common/rbac/rbac.guard";
import { P76CanonicalRehearsalAdminController } from "../src/modules/matching/p76-canonical-rehearsal-admin.controller";
import { P76AdminAllowlistApplyMetaController } from "../src/modules/matching/p76-admin-allowlist-apply-meta.controller";

describe("P76CanonicalRehearsalAdminController permissions", () => {
  it("uses VIEW_P76_CANONICAL_REHEARSAL on list", () => {
    const meta = Reflect.getMetadata(
      REQUIRED_PERMISSION_KEY,
      P76CanonicalRehearsalAdminController.prototype.list,
    );
    expect(meta).toBe(Permission.VIEW_P76_CANONICAL_REHEARSAL);
  });

  it("uses VIEW_P76_CANONICAL_REHEARSAL on aggregate", () => {
    const meta = Reflect.getMetadata(
      REQUIRED_PERMISSION_KEY,
      P76CanonicalRehearsalAdminController.prototype.aggregate,
    );
    expect(meta).toBe(Permission.VIEW_P76_CANONICAL_REHEARSAL);
  });

  it("uses VIEW_P76_CANONICAL_REHEARSAL on detail", () => {
    const meta = Reflect.getMetadata(
      REQUIRED_PERMISSION_KEY,
      P76CanonicalRehearsalAdminController.prototype.detail,
    );
    expect(meta).toBe(Permission.VIEW_P76_CANONICAL_REHEARSAL);
  });

  it("does not reuse VIEW_P76_ALLOWLIST_APPLY_META on rehearsal handlers", () => {
    for (const method of ["list", "aggregate", "detail"] as const) {
      const meta = Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        P76CanonicalRehearsalAdminController.prototype[method],
      );
      expect(meta).not.toBe(Permission.VIEW_P76_ALLOWLIST_APPLY_META);
    }
  });
});

describe("P76AdminAllowlistApplyMetaController permissions (unchanged)", () => {
  it("still uses VIEW_P76_ALLOWLIST_APPLY_META on list", () => {
    const meta = Reflect.getMetadata(
      REQUIRED_PERMISSION_KEY,
      P76AdminAllowlistApplyMetaController.prototype.list,
    );
    expect(meta).toBe(Permission.VIEW_P76_ALLOWLIST_APPLY_META);
  });
});
