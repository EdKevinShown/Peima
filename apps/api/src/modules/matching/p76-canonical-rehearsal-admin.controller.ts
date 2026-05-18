import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { Permission } from "@peima/shared/constants";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RbacGuard, RequirePermission } from "../../common/rbac/rbac.guard";
import {
  ListP76CanonicalRehearsalAdminQueryDto,
  toP76RehearsalAdminListQuery,
} from "./dto/list-p76-canonical-rehearsal-admin-query.dto";
import { P76CanonicalRehearsalAdminService } from "./p76-canonical-rehearsal-admin.service";

@Controller("admin/p76/canonical-rehearsal")
@UseGuards(JwtAuthGuard, RbacGuard)
export class P76CanonicalRehearsalAdminController {
  constructor(
    private readonly p76CanonicalRehearsalAdminService: P76CanonicalRehearsalAdminService,
  ) {}

  @Get()
  @RequirePermission(Permission.VIEW_P76_ALLOWLIST_APPLY_META)
  list(@Query() query: ListP76CanonicalRehearsalAdminQueryDto) {
    return this.p76CanonicalRehearsalAdminService.listP76CanonicalRehearsalAdmin(
      toP76RehearsalAdminListQuery(query),
    );
  }

  @Get("aggregate")
  @RequirePermission(Permission.VIEW_P76_ALLOWLIST_APPLY_META)
  aggregate(@Query() query: ListP76CanonicalRehearsalAdminQueryDto) {
    return this.p76CanonicalRehearsalAdminService.getP76CanonicalRehearsalAdminAggregate(
      toP76RehearsalAdminListQuery(query),
    );
  }

  @Get(":id")
  @RequirePermission(Permission.VIEW_P76_ALLOWLIST_APPLY_META)
  detail(@Param("id") id: string) {
    return this.p76CanonicalRehearsalAdminService.getP76CanonicalRehearsalAdminById(
      id,
    );
  }
}
