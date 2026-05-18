import { Module } from "@nestjs/common";
import { PrismaModule } from "../common/prisma/prisma.module";

@Module({
  imports: [PrismaModule],
})
export class P710R6aCanonicalWriterShadowAuditRunnerModule {}
