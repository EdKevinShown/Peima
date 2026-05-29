import { Module } from "@nestjs/common";
import { PrismaModule } from "../common/prisma/prisma.module";
import { ImagesModule } from "../modules/images/images.module";
import { CandidateImageDevImportService } from "../modules/dev/candidate-image-dev-import.service";

/** DEV-ONLY Nest context for CandidateImageDevImportService. */
@Module({
  imports: [PrismaModule, ImagesModule],
  providers: [CandidateImageDevImportService],
})
export class P75R4HCandidateImageImportRunnerModule {}
