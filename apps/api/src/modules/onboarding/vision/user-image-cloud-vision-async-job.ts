/**
 * P7.5-r7-c2: async cloud vision job — runCloudVisionFacadeAsync + DB merge.
 */

import type { OnboardingVisionEnv } from "./onboarding-vision-env";
import {
  mergeCloudVisionIntoDetectionScoreJson,
  shouldScheduleCloudVisionAsyncJob,
} from "./onboarding-vision-upload-persist";
import type { CloudVisionHttpFetch } from "./cloud-vision.http-client";
import {
  runCloudVisionFacadeAsync,
  type CloudVisionFacadeInput,
  type CloudVisionFacadeOptions,
} from "./cloud-vision.facade";
import type { OnboardingVisionProfileV1 } from "./onboarding-vision.types";
import type { CloudVisionImageRef } from "./cloud-vision.types";

export type UserImageCloudVisionAsyncJobParams = {
  userImageId: string;
  userId: string;
  detectionScoreJson: unknown;
  imageRef: CloudVisionImageRef;
};

export type UserImageCloudVisionAsyncJobDeps = {
  env: OnboardingVisionEnv;
  httpFetch?: CloudVisionHttpFetch;
  runFacade?: (
    input: CloudVisionFacadeInput,
    env: OnboardingVisionEnv,
    options?: CloudVisionFacadeOptions & { httpFetch?: CloudVisionHttpFetch },
  ) => Promise<OnboardingVisionProfileV1>;
};

export type UserImageCloudVisionAsyncJobResult =
  | { scheduled: false; reason: string }
  | { scheduled: true; mergedDetectionScoreJson: Record<string, unknown> };

/**
 * Pure job body (no Prisma). Never throws — returns merged JSON or original on failure.
 */
export async function runUserImageCloudVisionAsyncJob(
  params: UserImageCloudVisionAsyncJobParams,
  deps: UserImageCloudVisionAsyncJobDeps,
): Promise<UserImageCloudVisionAsyncJobResult> {
  const context = {
    imageId: params.userImageId,
    userId: params.userId,
  };

  if (!shouldScheduleCloudVisionAsyncJob(deps.env, context)) {
    return { scheduled: false, reason: "async_job_not_eligible" };
  }

  const runFacade = deps.runFacade ?? runCloudVisionFacadeAsync;
  const routedFrom =
    deps.env.provider === "zhipu" ? ("zhipu" as const) : ("cloud" as const);

  try {
    const profile = await runFacade(
      {
        detectionScoreJson: params.detectionScoreJson,
        imageRef: params.imageRef,
        imageId: params.userImageId,
        userId: params.userId,
      },
      deps.env,
      { httpFetch: deps.httpFetch, routedFrom },
    );

    return {
      scheduled: true,
      mergedDetectionScoreJson: mergeCloudVisionIntoDetectionScoreJson(
        params.detectionScoreJson,
        profile,
      ),
    };
  } catch {
    return { scheduled: false, reason: "async_job_exception" };
  }
}
