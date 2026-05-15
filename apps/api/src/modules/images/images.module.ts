import { Module } from "@nestjs/common";
import { ImagesController } from "./images.controller";
import { ImagesService } from "./images.service";
import { UserImageDetectionService } from "./user-image-detection.service";

@Module({
  controllers: [ImagesController],
  providers: [ImagesService, UserImageDetectionService],
  exports: [ImagesService],
})
export class ImagesModule {}
