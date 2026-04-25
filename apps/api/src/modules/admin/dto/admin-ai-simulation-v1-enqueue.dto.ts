import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsIn, IsNotEmpty, IsString, ValidateNested } from "class-validator";
import {
  AI_SIMULATION_V1_HINT_SOURCE,
  AI_SIMULATION_V1_SCHEMA,
  AI_SIMULATION_RUN_SPEC_V1,
} from "../../ai-simulation-v1/ai-simulation-v1.constants";
import { AiSimulationV1HintSnapshotItemDto } from "./ai-simulation-v1-hint-snapshot-item.dto";

const SCHEMA = [AI_SIMULATION_V1_SCHEMA] as const;
const HINT = [AI_SIMULATION_V1_HINT_SOURCE] as const;
const RUN = [AI_SIMULATION_RUN_SPEC_V1] as const;

export class AdminAiSimulationV1EnqueueDto {
  @IsString()
  @IsIn([...SCHEMA])
  schemaVersion!: typeof AI_SIMULATION_V1_SCHEMA;

  @IsString()
  @IsNotEmpty()
  viewerUserId!: string;

  @IsString()
  @IsIn([...HINT])
  hintSource!: typeof AI_SIMULATION_V1_HINT_SOURCE;

  @IsString()
  @IsNotEmpty()
  poolId!: string;

  @ValidateNested({ each: true })
  @Type(() => AiSimulationV1HintSnapshotItemDto)
  @IsArray()
  @ArrayMaxSize(200)
  hintSnapshot!: AiSimulationV1HintSnapshotItemDto[];

  @IsString()
  @IsIn([...RUN])
  runSpecVersion!: typeof AI_SIMULATION_RUN_SPEC_V1;
}
