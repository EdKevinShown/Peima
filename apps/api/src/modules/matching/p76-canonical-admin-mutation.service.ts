/**
 * P7.10-r8f — hidden admin Apply / Rollback API service (route env-gated).
 */

import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { applyP76CanonicalSidecarToMatchResult } from "./p76-canonical-apply.service";
import { readP76CanonicalApplyEnv } from "./p76-canonical-apply-env";
import type { P76CanonicalApplyEnvV1 } from "./p76-canonical-apply.types";
import { readP76CanonicalAdminMutationEnv } from "./p76-canonical-admin-mutation-env";
import {
  buildP76AdminMutationRouteBlockedResponse,
  isP76AdminMutationProductionEnvironment,
  mapP76AdminMutationGateContextToApply,
  mapP76AdminMutationGateContextToRollback,
  redactP76AdminMutationBodyForLogs,
  sanitizeP76CanonicalApplyApiResponse,
  sanitizeP76CanonicalRollbackApiResponse,
} from "./p76-canonical-admin-mutation.mapper";
import type {
  P76CanonicalAdminApplyBodyV1,
  P76CanonicalAdminMutationEnvV1,
  P76CanonicalAdminRollbackBodyV1,
} from "./p76-canonical-admin-mutation.types";
import { rollbackP76CanonicalApply } from "./p76-canonical-rollback.service";
import { readP76CanonicalRollbackEnv } from "./p76-canonical-rollback-env";
import type {
  P76CanonicalRollbackEnvV1,
  P76CanonicalRollbackPrisma,
} from "./p76-canonical-rollback.types";
import type { P76CanonicalApplyPrisma } from "./p76-canonical-apply.types";

export type P76CanonicalAdminApplyCallOptions = {
  routeEnv?: P76CanonicalAdminMutationEnvV1;
  applyEnv?: P76CanonicalApplyEnvV1;
  applyFn?: typeof applyP76CanonicalSidecarToMatchResult;
};

export type P76CanonicalAdminRollbackCallOptions = {
  routeEnv?: P76CanonicalAdminMutationEnvV1;
  rollbackEnv?: P76CanonicalRollbackEnvV1;
  rollbackFn?: typeof rollbackP76CanonicalApply;
  tokenPepper?: string;
};

@Injectable()
export class P76CanonicalAdminMutationService {
  constructor(private readonly prisma: PrismaService) {}

  assertMutationApiRouteVisible(routeEnv?: P76CanonicalAdminMutationEnvV1): void {
    const env = routeEnv ?? readP76CanonicalAdminMutationEnv();
    if (!env.mutationApiEnabled) {
      throw new NotFoundException(
        "P76 hidden admin canonical mutation API is disabled",
      );
    }
  }

  assertApplyRouteVisible(routeEnv?: P76CanonicalAdminMutationEnvV1): void {
    this.assertMutationApiRouteVisible(routeEnv);
    const env = routeEnv ?? readP76CanonicalAdminMutationEnv();
    if (!env.applyRouteEnabled) {
      throw new NotFoundException(
        "P76 hidden admin canonical Apply route is disabled",
      );
    }
  }

  assertRollbackRouteVisible(routeEnv?: P76CanonicalAdminMutationEnvV1): void {
    this.assertMutationApiRouteVisible(routeEnv);
    const env = routeEnv ?? readP76CanonicalAdminMutationEnv();
    if (!env.rollbackRouteEnabled) {
      throw new NotFoundException(
        "P76 hidden admin canonical Rollback route is disabled",
      );
    }
  }

  async applyCanonicalSidecar(
    sidecarId: string,
    body: P76CanonicalAdminApplyBodyV1,
    options: P76CanonicalAdminApplyCallOptions = {},
  ): Promise<Record<string, unknown>> {
    const routeEnv = options.routeEnv ?? readP76CanonicalAdminMutationEnv();
    this.assertApplyRouteVisible(routeEnv);

    if (isP76AdminMutationProductionEnvironment(body.environment)) {
      return buildP76AdminMutationRouteBlockedResponse(
        sidecarId,
        ["production_environment_blocked"],
        { snapshotId: body.snapshotId, matchResultId: body.matchResultId },
      );
    }

    const applyFn = options.applyFn ?? applyP76CanonicalSidecarToMatchResult;
    const gateContext = mapP76AdminMutationGateContextToApply(body.gateContext);
    const result = await applyFn(
      { prisma: this.prisma as unknown as P76CanonicalApplyPrisma },
      {
        sidecarId,
        snapshotId: body.snapshotId,
        requestedBy: body.requestedBy,
        environment: body.environment,
        gateContext,
        now: new Date().toISOString(),
      },
      { applyEnv: options.applyEnv ?? readP76CanonicalApplyEnv() },
    );

    return sanitizeP76CanonicalApplyApiResponse(result);
  }

  async rollbackCanonicalSidecar(
    sidecarId: string,
    body: P76CanonicalAdminRollbackBodyV1,
    options: P76CanonicalAdminRollbackCallOptions = {},
  ): Promise<Record<string, unknown>> {
    const routeEnv = options.routeEnv ?? readP76CanonicalAdminMutationEnv();
    this.assertRollbackRouteVisible(routeEnv);

    if (isP76AdminMutationProductionEnvironment(body.environment)) {
      return buildP76AdminMutationRouteBlockedResponse(
        sidecarId,
        ["production_environment_blocked"],
        { snapshotId: body.snapshotId, matchResultId: body.matchResultId },
      );
    }

    if (!body.rollbackTokenPlaintext?.trim()) {
      return buildP76AdminMutationRouteBlockedResponse(
        sidecarId,
        ["rollback_token_missing"],
        { snapshotId: body.snapshotId, matchResultId: body.matchResultId },
      );
    }

    const rollbackFn = options.rollbackFn ?? rollbackP76CanonicalApply;
    const gateContext = mapP76AdminMutationGateContextToRollback(body.gateContext);
    const result = await rollbackFn(
      { prisma: this.prisma as unknown as P76CanonicalRollbackPrisma },
      {
        sidecarId,
        snapshotId: body.snapshotId,
        matchResultId: body.matchResultId,
        rollbackTokenPlaintext: body.rollbackTokenPlaintext,
        requestedBy: body.requestedBy,
        environment: body.environment,
        gateContext,
        now: new Date().toISOString(),
      },
      {
        rollbackEnv: options.rollbackEnv ?? readP76CanonicalRollbackEnv(),
        tokenPepper: options.tokenPepper,
      },
    );

    return sanitizeP76CanonicalRollbackApiResponse(result);
  }

  redactBodyForLogs(body: Record<string, unknown>): Record<string, unknown> {
    return redactP76AdminMutationBodyForLogs(body);
  }
}
