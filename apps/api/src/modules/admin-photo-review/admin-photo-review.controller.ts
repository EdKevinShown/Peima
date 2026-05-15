import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { Permission } from "@peima/shared/constants";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RbacGuard, RequirePermission } from "../../common/rbac/rbac.guard";
import { AdminPhotoReviewService } from "./admin-photo-review.service";
import { ListPhotoReviewItemsQueryDto } from "./dto/list-photo-review-items-query.dto";
import type {
  AdminPhotoReviewDetailDto,
  AdminPhotoReviewListResponseDto,
} from "./dto/photo-review-item.dto";
import {
  ReviewPhotoActionWithReasonsDto,
  ReviewPhotoApproveDto,
} from "./dto/review-photo-action.dto";

type JwtReq = {
  user?: { userId: string };
};

@Controller("admin/photo-review")
@UseGuards(JwtAuthGuard, RbacGuard)
export class AdminPhotoReviewController {
  constructor(private readonly adminPhotoReviewService: AdminPhotoReviewService) {}

  private actorUserId(req: JwtReq): string {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException();
    }
    return userId;
  }

  @Get("items")
  @RequirePermission(Permission.MANAGE_PHOTO_REVIEW)
  listItems(
    @Query() query: ListPhotoReviewItemsQueryDto,
  ): Promise<AdminPhotoReviewListResponseDto> {
    return this.adminPhotoReviewService.listItems(query);
  }

  @Get("items/:imageId")
  @RequirePermission(Permission.MANAGE_PHOTO_REVIEW)
  getItemDetail(
    @Param("imageId") imageId: string,
  ): Promise<AdminPhotoReviewDetailDto> {
    return this.adminPhotoReviewService.getItemDetail(imageId);
  }

  @Post("items/:imageId/approve")
  @RequirePermission(Permission.MANAGE_PHOTO_REVIEW)
  approveItem(
    @Req() req: JwtReq,
    @Param("imageId") imageId: string,
    @Body() body: ReviewPhotoApproveDto,
  ): Promise<AdminPhotoReviewDetailDto> {
    return this.adminPhotoReviewService.approveItem(
      imageId,
      this.actorUserId(req),
      body,
    );
  }

  @Post("items/:imageId/reject")
  @RequirePermission(Permission.MANAGE_PHOTO_REVIEW)
  rejectItem(
    @Req() req: JwtReq,
    @Param("imageId") imageId: string,
    @Body() body: ReviewPhotoActionWithReasonsDto,
  ): Promise<AdminPhotoReviewDetailDto> {
    return this.adminPhotoReviewService.rejectItem(
      imageId,
      this.actorUserId(req),
      body,
    );
  }

  @Post("items/:imageId/needs-reupload")
  @RequirePermission(Permission.MANAGE_PHOTO_REVIEW)
  needsReuploadItem(
    @Req() req: JwtReq,
    @Param("imageId") imageId: string,
    @Body() body: ReviewPhotoActionWithReasonsDto,
  ): Promise<AdminPhotoReviewDetailDto> {
    return this.adminPhotoReviewService.needsReuploadItem(
      imageId,
      this.actorUserId(req),
      body,
    );
  }
}
