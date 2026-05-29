import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { UserImagePublicDto } from "./user-image-public.dto";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CreateUserImageDto } from "./dto/create-user-image.dto";
import { ImagesService } from "./images.service";
import type { MemoryUploadedFile } from "./memory-uploaded-file";

type JwtReq = Request & { user?: { userId: string } };

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

function publicBaseUrl(req: Request): string {
  const fixed = process.env.API_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  if (fixed) {
    return fixed;
  }
  const host =
    req.get("host") ?? `127.0.0.1:${process.env.API_PORT ?? "3000"}`;
  const xfProto = req.get("x-forwarded-proto");
  const proto =
    (xfProto?.split(",")[0]?.trim() as string) || req.protocol || "http";
  return `${proto}://${host}`;
}

@Controller("images")
@UseGuards(JwtAuthGuard)
export class ImagesController {
  constructor(private readonly imagesService: ImagesService) {}

  @Post()
  create(@Body() dto: CreateUserImageDto, @Req() req: JwtReq): Promise<UserImagePublicDto> {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId || dto.userId !== tokenUserId) {
      throw new UnauthorizedException("userId mismatch");
    }
    return this.imagesService.create(dto);
  }

  @Post("upload")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  upload(
    @UploadedFile() file: MemoryUploadedFile | undefined,
    @Body("userId") userId: string | undefined,
    @Req() req: JwtReq,
  ): Promise<UserImagePublicDto> {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId || !userId || userId !== tokenUserId) {
      throw new UnauthorizedException("userId mismatch");
    }
    if (!file) {
      throw new BadRequestException("file is required (field name: file)");
    }
    const base = publicBaseUrl(req);
    return this.imagesService.createFromUpload(userId, file, base);
  }

  /** Must be registered before @Get(':id') so "user" is not captured as id. */
  @Get("user/:userId")
  findAllByUser(
    @Param("userId") userId: string,
    @Req() req: JwtReq,
  ): Promise<UserImagePublicDto[]> {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId || userId !== tokenUserId) {
      throw new UnauthorizedException("userId mismatch");
    }
    return this.imagesService.findAllByUser(userId);
  }

  @Get(":id")
  async findOne(@Param("id") id: string, @Req() req: JwtReq): Promise<UserImagePublicDto> {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId) {
      throw new UnauthorizedException("not authenticated");
    }
    const row = await this.imagesService.findOneRecord(id);
    if (row.userId !== tokenUserId) {
      throw new UnauthorizedException();
    }
    return this.imagesService.findOne(id);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string, @Req() req: JwtReq): Promise<void> {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId) {
      throw new UnauthorizedException("not authenticated");
    }
    const row = await this.imagesService.findOneRecord(id);
    if (row.userId !== tokenUserId) {
      throw new UnauthorizedException();
    }
    await this.imagesService.remove(id);
  }
}
