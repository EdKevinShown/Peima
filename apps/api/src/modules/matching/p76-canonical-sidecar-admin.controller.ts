import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { Permission } from "@peima/shared/constants";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RbacGuard, RequirePermission } from "../../common/rbac/rbac.guard";
import {
  ListP76CanonicalSidecarAdminQueryDto,
  toP76CanonicalSidecarAdminListQuery,
} from "./dto/list-p76-canonical-sidecar-admin-query.dto";
import { P76CanonicalSidecarAdminService } from "./p76-canonical-sidecar-admin.service";

@Controller("admin/p76/canonical-sidecar")
@UseGuards(JwtAuthGuard, RbacGuard)
export class P76CanonicalSidecarAdminController {
  constructor(
    private readonly p76CanonicalSidecarAdminService: P76CanonicalSidecarAdminService,
  ) {}

  @Get()
  @RequirePermission(Permission.VIEW_P76_CANONICAL_REHEARSAL)
  list(@Query() query: ListP76CanonicalSidecarAdminQueryDto) {
    return this.p76CanonicalSidecarAdminService.listP76CanonicalSidecarAdmin(
      toP76CanonicalSidecarAdminListQuery(query),
    );
  }

  @Get("aggregate")
  @RequirePermission(Permission.VIEW_P76_CANONICAL_REHEARSAL)
  aggregate(@Query() query: ListP76CanonicalSidecarAdminQueryDto) {
    return this.p76CanonicalSidecarAdminService.getP76CanonicalSidecarAdminAggregate(
      toP76CanonicalSidecarAdminListQuery(query),
    );
  }

  @Get(":id")
  @RequirePermission(Permission.VIEW_P76_CANONICAL_REHEARSAL)
  detail(@Param("id") id: string) {
    return this.p76CanonicalSidecarAdminService.getP76CanonicalSidecarAdminById(
      id,
    );
  }
}
