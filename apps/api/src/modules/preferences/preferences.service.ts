import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@peima/database";
import {
  preferenceGateDenominator,
  type PreferenceGatePref,
} from "@peima/shared/matching/preference-hard-gate";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CreateOrUpdatePreferenceDto } from "./dto/create-or-update-preference.dto";

const PREFERENCE_DENOM_EMPTY_MESSAGE =
  "Preferences must include at least one matchable dimension: both minAge and maxAge, preferredCities, both minHeight and maxHeight, or a non-empty education, occupation, or relationship-goal preference list.";

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

  private gatePrefFromCreateDto(
    dto: CreateOrUpdatePreferenceDto,
  ): PreferenceGatePref {
    return {
      minAge: dto.minAge ?? null,
      maxAge: dto.maxAge ?? null,
      preferredCities: dto.preferredCities ?? [],
      minHeight: dto.minHeight ?? null,
      maxHeight: dto.maxHeight ?? null,
      educationPreferences: dto.educationPreferences ?? [],
      occupationPreferences: dto.occupationPreferences ?? [],
      relationshipGoalPreferences: dto.relationshipGoalPreferences ?? [],
    };
  }

  private mergeGatePref(
    existing: PreferenceGatePref,
    dto: CreateOrUpdatePreferenceDto,
  ): PreferenceGatePref {
    return {
      minAge: dto.minAge !== undefined ? dto.minAge ?? null : existing.minAge,
      maxAge: dto.maxAge !== undefined ? dto.maxAge ?? null : existing.maxAge,
      preferredCities:
        dto.preferredCities !== undefined
          ? dto.preferredCities
          : existing.preferredCities,
      minHeight:
        dto.minHeight !== undefined ? dto.minHeight ?? null : existing.minHeight,
      maxHeight:
        dto.maxHeight !== undefined ? dto.maxHeight ?? null : existing.maxHeight,
      educationPreferences:
        dto.educationPreferences !== undefined
          ? dto.educationPreferences
          : existing.educationPreferences,
      occupationPreferences:
        dto.occupationPreferences !== undefined
          ? dto.occupationPreferences
          : existing.occupationPreferences,
      relationshipGoalPreferences:
        dto.relationshipGoalPreferences !== undefined
          ? dto.relationshipGoalPreferences
          : existing.relationshipGoalPreferences,
    };
  }

  private assertHasPreferenceScoreDenominator(pref: PreferenceGatePref) {
    if (preferenceGateDenominator(pref) === 0) {
      throw new BadRequestException(PREFERENCE_DENOM_EMPTY_MESSAGE);
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
      this.assertHasPreferenceScoreDenominator(
        this.gatePrefFromCreateDto(dto),
      );
      return this.prisma.userPreference.create({ data: createData });
    }

    if (Object.keys(updateInput).length === 0) {
      return existing;
    }

    const merged: PreferenceGatePref = this.mergeGatePref(
      {
        minAge: existing.minAge,
        maxAge: existing.maxAge,
        preferredCities: existing.preferredCities,
        minHeight: existing.minHeight,
        maxHeight: existing.maxHeight,
        educationPreferences: existing.educationPreferences,
        occupationPreferences: existing.occupationPreferences,
        relationshipGoalPreferences: existing.relationshipGoalPreferences,
      },
      dto,
    );
    this.assertHasPreferenceScoreDenominator(merged);

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
