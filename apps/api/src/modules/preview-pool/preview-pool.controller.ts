import {
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
  UseGuards,
} from "@nestjs/common";
import { GeneratePreviewPoolDto } from "./dto/generate-preview-pool.dto";
import type { PreviewPoolBundle } from "./preview-pool.service";
import { PreviewPoolService } from "./preview-pool.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

type JwtReq = {
  user?: { userId: string };
};

@Controller("preview-pool")
@UseGuards(JwtAuthGuard)
export class PreviewPoolController {
  constructor(private readonly previewPoolService: PreviewPoolService) {}

  @Post("generate")
  generate(
    @Body() dto: GeneratePreviewPoolDto,
    @Req() req: JwtReq,
  ): Promise<PreviewPoolBundle> {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId || dto.userId !== tokenUserId) {
      throw new UnauthorizedException("userId mismatch");
    }
    return this.previewPoolService.generate(dto);
  }

  @Get("user/:userId/latest")
  findLatest(
    @Param("userId") userId: string,
    @Req() req: JwtReq,
  ): Promise<PreviewPoolBundle> {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId || userId !== tokenUserId) {
      throw new UnauthorizedException("userId mismatch");
    }
    return this.previewPoolService.findLatestActiveForUser(userId);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param("id") id: string,
    @Req() req: JwtReq,
  ): Promise<void> {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId) {
      throw new UnauthorizedException("not authenticated");
    }
    await this.previewPoolService.remove(id, tokenUserId);
  }
}
