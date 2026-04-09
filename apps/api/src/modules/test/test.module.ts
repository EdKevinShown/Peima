import { Module } from "@nestjs/common";
import { AdminModule } from "../admin/admin.module";
import { TestController } from "./test.controller";

@Module({
  imports: [AdminModule],
  controllers: [TestController],
})
export class TestModule {}
