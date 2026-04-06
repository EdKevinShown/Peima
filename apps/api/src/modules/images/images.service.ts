import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { UserImage } from "@peima/database";
import { Prisma } from "@peima/database";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CreateUserImageDto } from "./dto/create-user-image.dto";
import type { MemoryUploadedFile } from "./memory-uploaded-file";

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

@Injectable()
export class ImagesService {
  private readonly uploadDir =
    process.env.UPLOAD_DIR ?? join(process.cwd(), "uploads", "user-images");

  constructor(private readonly prisma: PrismaService) {
    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true });
    }
  }

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

  private extFromMimetype(mimetype: string): string | null {
    return MIME_TO_EXT[mimetype] ?? null;
  }

  /**
   * Saves multipart file to disk and creates a row with a public URL under /uploads/user-images/.
   */
  async createFromUpload(
    userId: string,
    file: MemoryUploadedFile,
    publicBaseUrl: string,
  ): Promise<UserImage> {
    const ext = this.extFromMimetype(file.mimetype);
    if (!ext) {
      throw new BadRequestException(
        `Unsupported image type: ${file.mimetype}. Allowed: jpeg, png, webp, gif.`,
      );
    }
    const buf = file.buffer;
    if (!buf?.length) {
      throw new BadRequestException("Empty file");
    }
    const stored = `${userId}-${randomUUID()}${ext}`;
    const dest = join(this.uploadDir, stored);
    await writeFile(dest, buf);
    const base = publicBaseUrl.replace(/\/$/, "");
    const imageUrl = `${base}/uploads/user-images/${stored}`;
    return this.create({ userId, imageUrl });
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
