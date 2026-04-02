import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@peima/database";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CreateUserImageDto } from "./dto/create-user-image.dto";

@Injectable()
export class ImagesService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
  }

  private toCreateInput(dto: CreateUserImageDto): Prisma.UserImageCreateInput {
    const input: Prisma.UserImageCreateInput = {
      user: { connect: { id: dto.userId } },
      imageUrl: dto.imageUrl,
      styleTags: dto.styleTags ?? [],
    };

    if (dto.faceEmbedding !== undefined) {
      input.faceEmbedding = dto.faceEmbedding as Prisma.InputJsonValue;
    }
    if (dto.attractivenessScore !== undefined) {
      input.attractivenessScore = dto.attractivenessScore;
    }
    if (dto.ageEstimate !== undefined) {
      input.ageEstimate = dto.ageEstimate;
    }
    if (dto.genderEstimate !== undefined) {
      input.genderEstimate = dto.genderEstimate;
    }
    if (dto.confidence !== undefined) {
      input.confidence = dto.confidence;
    }

    return input;
  }

  async create(dto: CreateUserImageDto) {
    await this.ensureUserExists(dto.userId);
    return this.prisma.userImage.create({
      data: this.toCreateInput(dto),
    });
  }

  async findAllByUser(userId: string) {
    await this.ensureUserExists(userId);
    return this.prisma.userImage.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(id: string) {
    const row = await this.prisma.userImage.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException(`Image ${id} not found`);
    }
    return row;
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.userImage.delete({ where: { id } });
  }
}
