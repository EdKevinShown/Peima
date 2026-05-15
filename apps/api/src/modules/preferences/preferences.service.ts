import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@peima/database";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CreateOrUpdatePreferenceDto } from "./dto/create-or-update-preference.dto";
import {
  ACCOUNT_CITY_VALUES,
  ACCOUNT_EDUCATION_VALUES,
  ACCOUNT_OCCUPATION_CATEGORY_VALUES,
  ACCOUNT_RELATIONSHIP_GOAL_VALUES,
  ACCOUNT_STYLE_TAG_WHITELIST,
} from "@peima/shared/constants";

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

  private assertEachAllowed(
    field: string,
    values: string[] | undefined,
    allowed: readonly string[],
  ) {
    if (!values?.length) return;
    const set = new Set(allowed);
    for (const v of values) {
      if (!set.has(v)) {
        throw new BadRequestException(
          `${field} contains invalid value: ${String(v)}`,
        );
      }
    }
  }

  private assertStructuredPreferenceLists(dto: CreateOrUpdatePreferenceDto) {
    this.assertEachAllowed(
      "preferredCities",
      dto.preferredCities,
      ACCOUNT_CITY_VALUES,
    );
    this.assertEachAllowed(
      "educationPreferences",
      dto.educationPreferences,
      ACCOUNT_EDUCATION_VALUES,
    );
    this.assertEachAllowed(
      "occupationPreferences",
      dto.occupationPreferences,
      ACCOUNT_OCCUPATION_CATEGORY_VALUES,
    );
    this.assertEachAllowed(
      "relationshipGoalPreferences",
      dto.relationshipGoalPreferences,
      ACCOUNT_RELATIONSHIP_GOAL_VALUES,
    );
    this.assertEachAllowed(
      "styleTags",
      dto.styleTags,
      ACCOUNT_STYLE_TAG_WHITELIST,
    );
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
    this.assertStructuredPreferenceLists(dto);

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
