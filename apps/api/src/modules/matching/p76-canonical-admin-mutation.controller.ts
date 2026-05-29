/**
 * P7.10-r8f — hidden POST Apply / Rollback (env-gated; wires r8d + r8e services).
 */

import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { Permission } from "@peima/shared/constants";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RbacGuard, RequirePermission } from "../../common/rbac/rbac.guard";
import {
  P76CanonicalAdminApplyBodyDto,
  P76CanonicalAdminRollbackBodyDto,
  toP76CanonicalAdminApplyBodyV1,
  toP76CanonicalAdminRollbackBodyV1,
} from "./dto/p76-canonical-admin-mutation-body.dto";
import { P76CanonicalAdminMutationService } from "./p76-canonical-admin-mutation.service";

@Controller("admin/p76/canonical-sidecar")
@UseGuards(JwtAuthGuard, RbacGuard)
export class P76CanonicalAdminMutationController {
  constructor(
    private readonly p76CanonicalAdminMutationService: P76CanonicalAdminMutationService,
  ) {}

  @Post(":sidecarId/apply")
  @RequirePermission(Permission.APPLY_P76_CANONICAL_REHEARSAL)
  apply(
    @Param("sidecarId") sidecarId: string,
    @Body() body: P76CanonicalAdminApplyBodyDto,
  ) {
    return this.p76CanonicalAdminMutationService.applyCanonicalSidecar(
      sidecarId,
      toP76CanonicalAdminApplyBodyV1(body),
    );
  }

  @Post(":sidecarId/rollback")
  @RequirePermission(Permission.ROLLBACK_P76_CANONICAL_WRITE)
  rollback(
    @Param("sidecarId") sidecarId: string,
    @Body() body: P76CanonicalAdminRollbackBodyDto,
  ) {
    return this.p76CanonicalAdminMutationService.rollbackCanonicalSidecar(
      sidecarId,
      toP76CanonicalAdminRollbackBodyV1(body),
    );
  }
}
