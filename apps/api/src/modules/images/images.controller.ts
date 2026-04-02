import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from "@nestjs/common";
import type { UserImage } from "@peima/database";
import { CreateUserImageDto } from "./dto/create-user-image.dto";
import { ImagesService } from "./images.service";

@Controller("images")
export class ImagesController {
  constructor(private readonly imagesService: ImagesService) {}

  @Post()
  create(@Body() dto: CreateUserImageDto): Promise<UserImage> {
    return this.imagesService.create(dto);
  }

  /** Must be registered before @Get(':id') so "user" is not captured as id. */
  @Get("user/:userId")
  findAllByUser(@Param("userId") userId: string): Promise<UserImage[]> {
    return this.imagesService.findAllByUser(userId);
  }

  @Get(":id")
  findOne(@Param("id") id: string): Promise<UserImage> {
    return this.imagesService.findOne(id);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string) {
    await this.imagesService.remove(id);
  }
}
