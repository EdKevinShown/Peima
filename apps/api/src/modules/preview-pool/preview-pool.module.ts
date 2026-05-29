import { Module } from "@nestjs/common";
import { PreviewPoolController } from "./preview-pool.controller";
import { PreviewPoolGeneratorService } from "./preview-pool-generator.service";
import { PreviewPoolService } from "./preview-pool.service";

@Module({
  controllers: [PreviewPoolController],
  providers: [PreviewPoolGeneratorService, PreviewPoolService],
  exports: [PreviewPoolGeneratorService, PreviewPoolService],
})
export class PreviewPoolModule {}
