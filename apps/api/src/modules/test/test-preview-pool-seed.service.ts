import { Injectable } from "@nestjs/common";
import { PreviewPoolGeneratorService } from "../preview-pool/preview-pool-generator.service";
import { PreviewPoolService, type PreviewPoolBundle } from "../preview-pool/preview-pool.service";

@Injectable()
export class TestPreviewPoolSeedService {
  constructor(
    private readonly previewPoolGenerator: PreviewPoolGeneratorService,
    private readonly previewPoolService: PreviewPoolService,
  ) {}

  async seedLatestForUser(viewerUserId: string): Promise<PreviewPoolBundle> {
    await this.previewPoolGenerator.ensureActivePool(viewerUserId, {
      source: "test_preview_pool_seed",
      replaceExisting: true,
      replacedStatus: "replaced_by_test_seed",
      allowSyntheticFallback: true,
    });
    return this.previewPoolService.findLatestActiveForUser(viewerUserId);
  }
}
