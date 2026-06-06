import { Module } from "@nestjs/common";
import { RbacModule } from "../../common/rbac/rbac.module";
import { OnboardingVisionModule } from "../onboarding/vision/onboarding-vision.module";
import { ImagesController } from "./images.controller";
import { ImagesService } from "./images.service";
import { UserImageContentAccessService } from "./user-image-content-access.service";
import { UserImageContentService } from "./user-image-content.service";
import { BlazeFaceDetectorAdapter } from "./blaze-face-detector.adapter";
import { UserImageDetectionService } from "./user-image-detection.service";
import { UserImageVisionSidecarService } from "./user-image-vision-sidecar.service";
import { UserImageCloudVisionAsyncService } from "./user-image-cloud-vision-async.service";

@Module({
  imports: [OnboardingVisionModule, RbacModule],
  controllers: [ImagesController],
  providers: [
    ImagesService,
    UserImageContentAccessService,
    UserImageContentService,
    BlazeFaceDetectorAdapter,
    UserImageDetectionService,
    UserImageVisionSidecarService,
    UserImageCloudVisionAsyncService,
  ],
  exports: [
    ImagesService,
    UserImageDetectionService,
    UserImageVisionSidecarService,
    UserImageCloudVisionAsyncService,
  ],
})
export class ImagesModule {}
