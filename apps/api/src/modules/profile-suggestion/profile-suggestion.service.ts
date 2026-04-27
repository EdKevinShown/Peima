import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Prisma, type ProfileUpdateSuggestion } from "@peima/database";
import { P2SourceType, P2SuggestionStatus } from "@peima/shared/constants";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { DimensionBranchChatHintItem } from "../questionnaire/dimension-branch-chat-hints";
import { mergePersistedDimensionBranchChatHintsJson } from "../questionnaire/dimension-branch-chat-hints";
import {
  P6_8_DIMENSION_BRANCH_HINTS_PATCH_KIND,
  P6_8_PROFILE_COMPLETION_CHAT_GENERATE_SOURCE_VERSION,
} from "../questionnaire/dimension-branch-chat-hints.constants";
import { parseProfileProposedPatch } from "./apply-profile-patch";
import type { CreateProfileSuggestionDto } from "./dto/create-profile-suggestion.dto";
import {
  isDimensionBranchHintsAcceptPayload,
  parseP6DimensionBranchHintsProposedPatch,
} from "./parse-p6-dimension-branch-hints-patch";
import { buildP6ChatProfileCompletionReviewSummary } from "./build-p6-chat-review-summary";
import { ProfileSuggestionRepository } from "./profile-suggestion.repository";
import { ChatProfileEvidenceV1Service } from "./chat-profile-evidence-v1.service";

const MINE_MAX_ROWS = 100;

@Injectable()
export class ProfileSuggestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: ProfileSuggestionRepository,
    private readonly chatProfileEvidenceV1: ChatProfileEvidenceV1Service,
  ) {}

  private async ensureUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
  }

  /**
   * P6.8: fail fast when a pending row already exists (same message as createP6 guard).
   */
  async throwIfPendingP6ChatProfileCompletionExists(
    tokenUserId: string,
    conversationId: string,
  ): Promise<void> {
    const dup = await this.repo.findPendingP6ChatProfileCompletionForConversation({
      userId: tokenUserId,
      sourceConversationId: conversationId,
      sourceVersion: P6_8_PROFILE_COMPLETION_CHAT_GENERATE_SOURCE_VERSION,
      sourceType: P2SourceType.Hybrid,
    });
    if (dup) {
      throw new ConflictException(
        "A pending P6.8 profile-completion suggestion already exists for this conversation",
      );
    }
  }

  findLatestP6ChatProfileCompletionForConversation(
    tokenUserId: string,
    conversationId: string,
  ): Promise<ProfileUpdateSuggestion | null> {
    return this.repo.findLatestP6ChatProfileCompletionForConversation({
      userId: tokenUserId,
      sourceConversationId: conversationId,
      sourceVersion: P6_8_PROFILE_COMPLETION_CHAT_GENERATE_SOURCE_VERSION,
      sourceType: P2SourceType.Hybrid,
    });
  }

  async create(dto: CreateProfileSuggestionDto, tokenUserId: string) {
    if (dto.userId !== tokenUserId) {
      throw new UnauthorizedException("userId mismatch");
    }
    await this.ensureUserExists(tokenUserId);

    const proposedPatch = dto.proposedPatch as Prisma.InputJsonValue;

    return this.repo.create({
      userId: tokenUserId,
      status: P2SuggestionStatus.Pending,
      sourceType: dto.sourceType,
      sourceVersion: dto.sourceVersion,
      proposedPatch,
    });
  }

  /**
   * P6.8 chat-generated dimension-branch hints (pending). Duplicate guard per conversation + sourceVersion.
   */
  async createP6ChatProfileCompletionSuggestion(params: {
    tokenUserId: string;
    conversationId: string;
    hintItems: ReadonlyArray<DimensionBranchChatHintItem>;
    generatedUpToMessageId: string;
  }): Promise<ProfileUpdateSuggestion> {
    const { tokenUserId, conversationId, hintItems, generatedUpToMessageId } =
      params;
    await this.ensureUserExists(tokenUserId);

    await this.throwIfPendingP6ChatProfileCompletionExists(
      tokenUserId,
      conversationId,
    );

    const proposedPatch: Prisma.InputJsonValue = {
      kind: P6_8_DIMENSION_BRANCH_HINTS_PATCH_KIND,
      schemaVersion: 1,
      items: [...hintItems],
    };

    const reviewSummary = buildP6ChatProfileCompletionReviewSummary(
      hintItems,
    ) as Prisma.InputJsonValue;

    try {
      return await this.repo.create({
        userId: tokenUserId,
        status: P2SuggestionStatus.Pending,
        // P6.8 chat 生成：复用 hybrid；与 Copilot/其它来源靠 sourceVersion + sourceConversationId 区分。
        sourceType: P2SourceType.Hybrid,
        sourceVersion: P6_8_PROFILE_COMPLETION_CHAT_GENERATE_SOURCE_VERSION,
        proposedPatch,
        reviewSummary,
        sourceConversationId: conversationId,
        generatedUpToMessageId,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        throw new ConflictException(
          "A pending P6.8 profile-completion suggestion already exists for this conversation",
        );
      }
      throw e;
    }
  }

  listMine(tokenUserId: string) {
    return this.repo.findByUserId(tokenUserId, MINE_MAX_ROWS);
  }

  private async loadSuggestionForUserOrThrow(
    tx: Prisma.TransactionClient,
    suggestionId: string,
    tokenUserId: string,
  ) {
    const row = await tx.profileUpdateSuggestion.findUnique({
      where: { id: suggestionId },
    });

    if (!row || row.userId !== tokenUserId) {
      throw new NotFoundException(`Suggestion ${suggestionId} not found`);
    }

    return row;
  }

  async accept(suggestionId: string, tokenUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      const row = await this.loadSuggestionForUserOrThrow(
        tx,
        suggestionId,
        tokenUserId,
      );

      if (row.status !== P2SuggestionStatus.Pending) {
        throw new ConflictException("suggestion is not pending");
      }

      const resolvedAt = new Date();

      const claimed = await tx.profileUpdateSuggestion.updateMany({
        where: {
          id: suggestionId,
          userId: tokenUserId,
          status: P2SuggestionStatus.Pending,
        },
        data: {
          status: P2SuggestionStatus.Accepted,
          resolvedAt,
        },
      });

      if (claimed.count !== 1) {
        throw new ConflictException("suggestion is not pending");
      }

      if (isDimensionBranchHintsAcceptPayload(row)) {
        const items = parseP6DimensionBranchHintsProposedPatch(row.proposedPatch, {
          sourceVersion: row.sourceVersion,
        });
        const existing = await tx.userProfile.findUnique({
          where: { userId: tokenUserId },
          select: { dimensionBranchChatHints: true },
        });
        const merged = mergePersistedDimensionBranchChatHintsJson(
          existing?.dimensionBranchChatHints ?? null,
          items,
        );
        if (!merged.ok) {
          throw new UnprocessableEntityException(
            "dimensionBranchChatHints would exceed 3 axes after merge",
          );
        }
        await tx.userProfile.upsert({
          where: { userId: tokenUserId },
          create: {
            userId: tokenUserId,
            dimensionBranchChatHints: merged.json,
          },
          update: { dimensionBranchChatHints: merged.json },
        });
        if (row.sourceConversationId) {
          await this.chatProfileEvidenceV1.upsertEvidenceAndRecomputeOverlay(
            tx,
            {
              userId: tokenUserId,
              conversationId: row.sourceConversationId,
              suggestionId: row.id,
              sourceVersion: row.sourceVersion ?? "",
              acceptedAt: resolvedAt,
              items,
            },
          );
        }
      } else {
        const patch = parseProfileProposedPatch(row.proposedPatch);
        if (Object.keys(patch).length > 0) {
          await tx.userProfile.upsert({
            where: { userId: tokenUserId },
            create: {
              userId: tokenUserId,
              ...patch,
            },
            update: patch,
          });
        }
      }

      return tx.profileUpdateSuggestion.findUniqueOrThrow({
        where: { id: suggestionId },
      });
    });
  }

  async dismiss(suggestionId: string, tokenUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      const row = await this.loadSuggestionForUserOrThrow(
        tx,
        suggestionId,
        tokenUserId,
      );

      if (row.status !== P2SuggestionStatus.Pending) {
        throw new ConflictException("suggestion is not pending");
      }

      const claimed = await tx.profileUpdateSuggestion.updateMany({
        where: {
          id: suggestionId,
          userId: tokenUserId,
          status: P2SuggestionStatus.Pending,
        },
        data: {
          status: P2SuggestionStatus.Dismissed,
          resolvedAt: new Date(),
        },
      });

      if (claimed.count !== 1) {
        throw new ConflictException("suggestion is not pending");
      }

      return tx.profileUpdateSuggestion.findUniqueOrThrow({
        where: { id: suggestionId },
      });
    });
  }
}
