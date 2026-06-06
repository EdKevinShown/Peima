import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { authorizeSelfUserAccess } from "../../common/auth/authorize-self-user-access";
import { RbacService } from "../../common/rbac/rbac.service";
import { CreateOrUpdatePreferenceDto } from "./dto/create-or-update-preference.dto";
import { PreferencesService } from "./preferences.service";

type JwtReq = {
  user?: { userId: string };
};

@Controller("preferences")
@UseGuards(JwtAuthGuard)
export class PreferencesController {
  constructor(
    private readonly preferencesService: PreferencesService,
    private readonly rbacService: RbacService,
  ) {}

  @Put(":userId")
  async upsert(
    @Param("userId") userId: string,
    @Body() dto: CreateOrUpdatePreferenceDto,
    @Req() req: JwtReq,
  ) {
    await authorizeSelfUserAccess(this.rbacService, {
      tokenUserId: req.user?.userId,
      requestedUserId: userId,
    });
    return this.preferencesService.upsertForUser(userId, dto);
  }

  @Get(":userId")
  async findForUser(@Param("userId") userId: string, @Req() req: JwtReq) {
    await authorizeSelfUserAccess(this.rbacService, {
      tokenUserId: req.user?.userId,
      requestedUserId: userId,
    });
    return this.preferencesService.getForUser(userId);
  }
}
