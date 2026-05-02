import { type PrismaClient } from "@peima/database";
import type { AiSimulationV1ChatResult } from "../../../apps/api/src/modules/ai-simulation-v1/ai-simulation-v1-chat.client";
import type { QuestionnaireProfileView } from "../../../apps/api/src/modules/questionnaire/questionnaire.service";
export type AiSimulationV1JobRunPorts = {
    prisma: PrismaClient;
    logError: (meta: Record<string, unknown>, message: string) => void;
    completeChat: (system: string, user: string) => Promise<AiSimulationV1ChatResult>;
    getProfileForUser: (userId: string) => Promise<QuestionnaireProfileView>;
};
export declare function runAiSimulationV1JobExecution(ports: AiSimulationV1JobRunPorts, params: {
    jobId: string;
    viewerUserId: string;
}): Promise<void>;
