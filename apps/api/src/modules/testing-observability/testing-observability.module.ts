import { Module } from "@nestjs/common";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { TestingObservabilityController } from "./testing-observability.controller";
import { TestingObservabilityGuard } from "./testing-observability.guard";
import { TestingObservabilityService } from "./testing-observability.service";

@Module({
  imports: [PrismaModule],
  controllers: [TestingObservabilityController],
  providers: [TestingObservabilityService, TestingObservabilityGuard],
  exports: [TestingObservabilityService],
})
export class TestingObservabilityModule {}
