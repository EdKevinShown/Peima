import {
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { P2SourceType } from "@peima/shared/constants";

const SOURCE_TYPE_VALUES = Object.values(P2SourceType);

export class CreateBehaviorSignalDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  eventType!: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(SOURCE_TYPE_VALUES)
  sourceType!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  sourceVersion!: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  occurredAt?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  conversationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  sessionId?: string;

  @IsOptional()
  @IsObject()
  properties?: Record<string, unknown>;
}
