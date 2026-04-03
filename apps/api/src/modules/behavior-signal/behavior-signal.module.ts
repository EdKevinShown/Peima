import { Module } from "@nestjs/common";
import { BehaviorSignalController } from "./behavior-signal.controller";
import { BehaviorSignalRepository } from "./behavior-signal.repository";
import { BehaviorSignalService } from "./behavior-signal.service";

@Module({
  controllers: [BehaviorSignalController],
  providers: [BehaviorSignalService, BehaviorSignalRepository],
  exports: [BehaviorSignalService],
})
export class BehaviorSignalModule {}
