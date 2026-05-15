import { Module } from "@nestjs/common";
import { ImagesController } from "./images.controller";
import { ImagesService } from "./images.service";
import { BlazeFaceDetectorAdapter } from "./blaze-face-detector.adapter";
import { UserImageDetectionService } from "./user-image-detection.service";

@Module({
  controllers: [ImagesController],
  providers: [
    ImagesService,
    BlazeFaceDetectorAdapter,
    UserImageDetectionService,
  ],
  exports: [ImagesService],
})
export class ImagesModule {}
