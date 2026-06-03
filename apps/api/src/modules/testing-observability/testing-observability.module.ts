import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { TestingObservabilityController } from "./testing-observability.controller";
import { TestingObservabilityGuard } from "./testing-observability.guard";
import { TestingObservabilityService } from "./testing-observability.service";

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || "change-me-in-production",
    }),
  ],
  controllers: [TestingObservabilityController],
  providers: [TestingObservabilityService, TestingObservabilityGuard],
  exports: [TestingObservabilityService],
})
export class TestingObservabilityModule {}
