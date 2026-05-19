/**
 * P7.10-r8f — hidden admin Apply / Rollback API types.
 */

import type { P76CanonicalApplyResultV1 } from "./p76-canonical-apply.types";
import type { P76CanonicalRollbackResultV1 } from "./p76-canonical-rollback.types";

export const P76_CANONICAL_ADMIN_MUTATION_API_SCHEMA_VERSION = 1 as const;

export const P76_CANONICAL_ADMIN_MUTATION_API_SOURCE_TYPE =
  "p76_canonical_admin_mutation_api" as const;

export const P76_CANONICAL_ADMIN_MUTATION_API_SOURCE_VERSION =
  "p7.10-r8f-hidden-admin-apply-rollback-api-v1" as const;

export type P76CanonicalAdminMutationRouteBlockedReason =
  | "hidden_admin_mutation_api_disabled"
  | "hidden_admin_apply_route_disabled"
  | "hidden_admin_rollback_route_disabled"
  | "production_environment_blocked"
  | "invalid_mutation_environment"
  | "rollback_token_missing";

export type P76CanonicalAdminMutationEnvV1 = {
  mutationApiEnabled: boolean;
  applyRouteEnabled: boolean;
  rollbackRouteEnabled: boolean;
  configuredEnvironment: string;
  nodeEnv: string;
  mutationEnvironmentAllowed: boolean;
  productionBlocked: boolean;
  canApplyRoute: boolean;
  canRollbackRoute: boolean;
};

export type P76CanonicalAdminMutationGateContextBodyV1 = {
  gate12Final: boolean;
  grafanaReady: boolean;
  pmSignoff: boolean;
  opsSignoff: boolean;
  engSignoff: boolean;
  activeIncident: boolean;
  activeWorkerDeploy: boolean;
  percent: number;
};

export type P76CanonicalAdminApplyBodyV1 = {
  snapshotId: string;
  matchResultId: string;
  requestedBy: string;
  environment: string;
  gateContext: P76CanonicalAdminMutationGateContextBodyV1;
};

export type P76CanonicalAdminRollbackBodyV1 = P76CanonicalAdminApplyBodyV1 & {
  rollbackTokenPlaintext: string;
};

export type P76CanonicalAdminMutationBlockedResponseV1 = {
  schemaVersion: typeof P76_CANONICAL_ADMIN_MUTATION_API_SCHEMA_VERSION;
  sourceType: typeof P76_CANONICAL_ADMIN_MUTATION_API_SOURCE_TYPE;
  sourceVersion: typeof P76_CANONICAL_ADMIN_MUTATION_API_SOURCE_VERSION;
  mode: "blocked";
  applied?: false;
  rolledBack?: false;
  blockedReasons: string[];
  sidecarId: string;
  snapshotId?: string;
  matchResultId?: string;
  safety: {
    writesDb: false;
    triggersWorker: false;
    changesPercent: false;
    productionRollout: false;
  };
};

export type P76CanonicalAdminApplyApiResponseV1 =
  | P76CanonicalAdminMutationBlockedResponseV1
  | (Omit<P76CanonicalApplyResultV1, never> & { mode: "blocked" | "applied" });

export type P76CanonicalAdminRollbackApiResponseV1 =
  | P76CanonicalAdminMutationBlockedResponseV1
  | (Omit<P76CanonicalRollbackResultV1, never> & { mode: "blocked" | "rolled_back" });
