import { Module } from "@nestjs/common";
import { AdminModule } from "../admin/admin.module";
import { PreviewPoolModule } from "../preview-pool/preview-pool.module";
import { TestController } from "./test.controller";
import { TestPreviewPoolSeedService } from "./test-preview-pool-seed.service";

@Module({
  imports: [AdminModule, PreviewPoolModule],
  controllers: [TestController],
  providers: [TestPreviewPoolSeedService],
})
export class TestModule {}
