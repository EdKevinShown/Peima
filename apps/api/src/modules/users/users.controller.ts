import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { authorizeSelfUserAccess } from "../../common/auth/authorize-self-user-access";
import { RbacService } from "../../common/rbac/rbac.service";
import { UpdateUserProfileDto } from "./dto/update-user-profile.dto";
import { UsersService } from "./users.service";

type JwtReq = {
  user?: { userId: string };
};

@Controller("users")
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly rbacService: RbacService,
  ) {}

  @Get(":id")
  async findOne(@Param("id") id: string, @Req() req: JwtReq) {
    await authorizeSelfUserAccess(this.rbacService, {
      tokenUserId: req.user?.userId,
      requestedUserId: id,
    });
    return this.usersService.findOne(id);
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateUserProfileDto,
    @Req() req: JwtReq,
  ) {
    await authorizeSelfUserAccess(this.rbacService, {
      tokenUserId: req.user?.userId,
      requestedUserId: id,
    });
    return this.usersService.update(id, dto);
  }
}
