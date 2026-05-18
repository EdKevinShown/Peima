import { Module } from "@nestjs/common";
import { OnboardingVisionModule } from "../onboarding/vision/onboarding-vision.module";
import { ImagesController } from "./images.controller";
import { ImagesService } from "./images.service";
import { BlazeFaceDetectorAdapter } from "./blaze-face-detector.adapter";
import { UserImageDetectionService } from "./user-image-detection.service";
import { UserImageVisionSidecarService } from "./user-image-vision-sidecar.service";
import { UserImageCloudVisionAsyncService } from "./user-image-cloud-vision-async.service";

@Module({
  imports: [OnboardingVisionModule],
  controllers: [ImagesController],
  providers: [
    ImagesService,
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
