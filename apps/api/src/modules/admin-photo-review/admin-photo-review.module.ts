import { Module } from "@nestjs/common";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { RbacModule } from "../../common/rbac/rbac.module";
import { AuthModule } from "../auth/auth.module";
import { AdminPhotoReviewController } from "./admin-photo-review.controller";
import { AdminPhotoReviewService } from "./admin-photo-review.service";

@Module({
  imports: [PrismaModule, RbacModule, AuthModule],
  controllers: [AdminPhotoReviewController],
  providers: [AdminPhotoReviewService],
})
export class AdminPhotoReviewModule {}
