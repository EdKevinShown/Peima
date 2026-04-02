import { Module } from "@nestjs/common";
import { PreviewPoolController } from "./preview-pool.controller";
import { PreviewPoolService } from "./preview-pool.service";

@Module({
  controllers: [PreviewPoolController],
  providers: [PreviewPoolService],
  exports: [PreviewPoolService],
})
export class PreviewPoolModule {}
