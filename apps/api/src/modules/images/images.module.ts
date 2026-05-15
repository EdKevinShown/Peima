import { Module } from "@nestjs/common";
import { OnboardingVisionModule } from "../onboarding/vision/onboarding-vision.module";
import { ImagesController } from "./images.controller";
import { ImagesService } from "./images.service";
import { BlazeFaceDetectorAdapter } from "./blaze-face-detector.adapter";
import { UserImageDetectionService } from "./user-image-detection.service";
import { UserImageVisionSidecarService } from "./user-image-vision-sidecar.service";

@Module({
  imports: [OnboardingVisionModule],
  controllers: [ImagesController],
  providers: [
    ImagesService,
    BlazeFaceDetectorAdapter,
    UserImageDetectionService,
    UserImageVisionSidecarService,
  ],
  exports: [
    ImagesService,
    UserImageDetectionService,
    UserImageVisionSidecarService,
  ],
})
export class ImagesModule {}
