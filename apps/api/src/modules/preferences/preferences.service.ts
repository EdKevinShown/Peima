import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@peima/database";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CreateOrUpdatePreferenceDto } from "./dto/create-or-update-preference.dto";

@Injectable()
export class PreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
  }

  private validateAgeHeightRanges(dto: CreateOrUpdatePreferenceDto) {
    const { minAge, maxAge, minHeight, maxHeight } = dto;
    if (minAge != null && maxAge != null && minAge > maxAge) {
      throw new BadRequestException("minAge cannot be greater than maxAge");
    }
    if (minHeight != null && maxHeight != null && minHeight > maxHeight) {
      throw new BadRequestException("minHeight cannot be greater than maxHeight");
    }
  }

  private buildUpdateInput(
    dto: CreateOrUpdatePreferenceDto,
  ): Prisma.UserPreferenceUpdateInput {
    const data: Prisma.UserPreferenceUpdateInput = {};
    if (dto.minAge !== undefined) data.minAge = dto.minAge;
    if (dto.maxAge !== undefined) data.maxAge = dto.maxAge;
    if (dto.preferredCities !== undefined) data.preferredCities = dto.preferredCities;
    if (dto.minHeight !== undefined) data.minHeight = dto.minHeight;
    if (dto.maxHeight !== undefined) data.maxHeight = dto.maxHeight;
    if (dto.educationPreferences !== undefined) {
      data.educationPreferences = dto.educationPreferences;
    }
    if (dto.occupationPreferences !== undefined) {
      data.occupationPreferences = dto.occupationPreferences;
    }
    if (dto.relationshipGoalPreferences !== undefined) {
      data.relationshipGoalPreferences = dto.relationshipGoalPreferences;
    }
    if (dto.styleTags !== undefined) data.styleTags = dto.styleTags;
    return data;
  }

  async upsertForUser(userId: string, dto: CreateOrUpdatePreferenceDto) {
    await this.ensureUserExists(userId);
    this.validateAgeHeightRanges(dto);

    const createData: Prisma.UserPreferenceCreateInput = {
      user: { connect: { id: userId } },
      minAge: dto.minAge ?? null,
      maxAge: dto.maxAge ?? null,
      preferredCities: dto.preferredCities ?? [],
      minHeight: dto.minHeight ?? null,
      maxHeight: dto.maxHeight ?? null,
      educationPreferences: dto.educationPreferences ?? [],
      occupationPreferences: dto.occupationPreferences ?? [],
      relationshipGoalPreferences: dto.relationshipGoalPreferences ?? [],
      styleTags: dto.styleTags ?? [],
    };

    const updateInput = this.buildUpdateInput(dto);
    const existing = await this.prisma.userPreference.findUnique({
      where: { userId },
    });

    if (!existing) {
      return this.prisma.userPreference.create({ data: createData });
    }

    if (Object.keys(updateInput).length === 0) {
      return existing;
    }

    return this.prisma.userPreference.update({
      where: { userId },
      data: updateInput,
    });
  }

  async getForUser(userId: string) {
    await this.ensureUserExists(userId);

    const preference = await this.prisma.userPreference.findUnique({
      where: { userId },
    });

    if (!preference) {
      throw new NotFoundException(`Preference for user ${userId} not found`);
    }

    return preference;
  }
}
