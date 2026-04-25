import { Type } from "class-transformer";
import { IsIn, IsNotEmpty, IsNumber, IsString } from "class-validator";

/**
 * One row of `simulationQueueHint` from post-pool shadow — must be a nested DTO so
 * `ValidationPipe({ whitelist: true })` does not strip inner keys.
 */
export class AiSimulationV1HintSnapshotItemDto {
  @Type(() => Number)
  @IsNumber()
  rankHint!: number;

  @IsString()
  @IsNotEmpty()
  candidateUserId!: string;

  @IsString()
  @IsIn(["promote", "neutral", "demote"])
  bucket!: "promote" | "neutral" | "demote";

  @Type(() => Number)
  @IsNumber()
  prescreenScore!: number;
}
