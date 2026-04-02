import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { CreateUserProfileDto } from "./dto/create-user-profile.dto";
import { UpdateUserProfileDto } from "./dto/update-user-profile.dto";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body() dto: CreateUserProfileDto) {
    return this.usersService.create(dto);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateUserProfileDto) {
    return this.usersService.update(id, dto);
  }
}
