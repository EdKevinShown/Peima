import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { Permission } from "@peima/shared/constants";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RbacGuard, RequirePermission } from "../../common/rbac/rbac.guard";
import {
  ListP76AdminAllowlistApplyMetaQueryDto,
  toP76AdminListQuery,
} from "./dto/list-p76-admin-allowlist-apply-meta-query.dto";
import { P76AdminAllowlistApplyMetaService } from "./p76-admin-allowlist-apply-meta.service";

@Controller("admin/p76/allowlist-apply-meta")
@UseGuards(JwtAuthGuard, RbacGuard)
export class P76AdminAllowlistApplyMetaController {
  constructor(
    private readonly p76AdminAllowlistApplyMetaService: P76AdminAllowlistApplyMetaService,
  ) {}

  @Get()
  @RequirePermission(Permission.VIEW_P76_ALLOWLIST_APPLY_META)
  list(@Query() query: ListP76AdminAllowlistApplyMetaQueryDto) {
    return this.p76AdminAllowlistApplyMetaService.listP76AllowlistApplyMeta(
      toP76AdminListQuery(query),
    );
  }

  @Get("aggregate")
  @RequirePermission(Permission.VIEW_P76_ALLOWLIST_APPLY_META)
  aggregate(@Query() query: ListP76AdminAllowlistApplyMetaQueryDto) {
    return this.p76AdminAllowlistApplyMetaService.getP76AllowlistApplyMetaAggregate(
      toP76AdminListQuery(query),
    );
  }

  @Get(":id")
  @RequirePermission(Permission.VIEW_P76_ALLOWLIST_APPLY_META)
  detail(@Param("id") id: string) {
    return this.p76AdminAllowlistApplyMetaService.getP76AllowlistApplyMetaById(
      id,
    );
  }
}
