import { Module } from "@nestjs/common";
import { PrismaModule } from "../common/prisma/prisma.module";

/** P7.10-r3f3 — Prisma-only bootstrap for sidecar writer local smoke. */
@Module({
  imports: [PrismaModule],
})
export class P710R3f3CanonicalSidecarWriterRunnerModule {}
