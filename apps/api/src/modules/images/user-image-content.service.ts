import {
  Injectable,
  NotFoundException,
  UnsupportedMediaTypeException,
} from "@nestjs/common";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import sharp from "sharp";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  resolveUserImageDiskPath,
  storedFilenameFromImageUrl,
} from "./user-image-stored-path";
import type { UserImageContentVariant } from "./user-image-content-access.types";
import { UserImageContentAccessService } from "./user-image-content-access.service";

const EXT_TO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

@Injectable()
export class UserImageContentService {
  private readonly uploadDir =
    process.env.UPLOAD_DIR ?? join(process.cwd(), "uploads", "user-images");

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: UserImageContentAccessService,
  ) {}

  private contentTypeForPath(filePath: string): string {
    const ext = extname(filePath).toLowerCase();
    return EXT_TO_MIME[ext] ?? "application/octet-stream";
  }

  private async transformVariant(
    buffer: Buffer,
    variant: UserImageContentVariant,
    contentType: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    if (variant === "clear") {
      return { buffer, contentType };
    }
    const pipeline = sharp(buffer).blur(24).resize({
      width: 480,
      withoutEnlargement: true,
    });
    if (contentType === "image/png") {
      const out = await pipeline.png({ quality: 60 }).toBuffer();
      return { buffer: out, contentType: "image/png" };
    }
    const out = await pipeline.jpeg({ quality: 55 }).toBuffer();
    return { buffer: out, contentType: "image/jpeg" };
  }

  async getImageContentForViewer(
    imageId: string,
    viewerUserId: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const row = await this.prisma.userImage.findUnique({ where: { id: imageId } });
    if (!row) {
      throw new NotFoundException(`Image ${imageId} not found`);
    }

    const access = await this.access.resolveAccess(viewerUserId, row);
    this.access.assertAccessOrThrow(access);

    const diskPath = resolveUserImageDiskPath(row.imageUrl, this.uploadDir);
    if (!diskPath || !existsSync(diskPath)) {
      const filename = storedFilenameFromImageUrl(row.imageUrl);
      throw new NotFoundException(
        filename
          ? `Image file missing on disk: ${filename}`
          : `Image file reference invalid for ${imageId}`,
      );
    }

    const raw = await readFile(diskPath);
    if (!raw.length) {
      throw new UnsupportedMediaTypeException("empty image file");
    }

    const contentType = this.contentTypeForPath(diskPath);
    return this.transformVariant(raw, access.variant, contentType);
  }
}
