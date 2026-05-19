/**
 * P7.10-r7f — GET apply-preview (read-only; wires r7d preview builder).
 */

import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { Permission } from "@peima/shared/constants";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RbacGuard, RequirePermission } from "../../common/rbac/rbac.guard";
import { P76CanonicalApplyPreviewService } from "./p76-canonical-apply-preview.service";

@Controller("admin/p76/canonical-sidecar")
@UseGuards(JwtAuthGuard, RbacGuard)
export class P76CanonicalApplyPreviewController {
  constructor(
    private readonly p76CanonicalApplyPreviewService: P76CanonicalApplyPreviewService,
  ) {}

  @Get(":id/apply-preview")
  @RequirePermission(Permission.VIEW_P76_CANONICAL_REHEARSAL)
  applyPreview(@Param("id") id: string) {
    return this.p76CanonicalApplyPreviewService.getApplyPreviewBySidecarId(id);
  }
}
