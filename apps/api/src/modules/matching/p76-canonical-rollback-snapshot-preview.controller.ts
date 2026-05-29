/**
 * P7.10-r7j — GET rollback-snapshot-preview (read-only; wires r7g snapshot builder).
 */

import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { Permission } from "@peima/shared/constants";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RbacGuard, RequirePermission } from "../../common/rbac/rbac.guard";
import { P76CanonicalRollbackSnapshotPreviewService } from "./p76-canonical-rollback-snapshot-preview.service";

@Controller("admin/p76/canonical-sidecar")
@UseGuards(JwtAuthGuard, RbacGuard)
export class P76CanonicalRollbackSnapshotPreviewController {
  constructor(
    private readonly p76CanonicalRollbackSnapshotPreviewService: P76CanonicalRollbackSnapshotPreviewService,
  ) {}

  @Get(":id/rollback-snapshot-preview")
  @RequirePermission(Permission.VIEW_P76_CANONICAL_REHEARSAL)
  rollbackSnapshotPreview(@Param("id") id: string) {
    return this.p76CanonicalRollbackSnapshotPreviewService.getRollbackSnapshotPreviewBySidecarId(
      id,
    );
  }
}
