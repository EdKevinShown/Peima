import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { ProfileUpdateSuggestion } from "@peima/database";
import { P6_8_DIMENSION_BRANCH_HINTS_PATCH_KIND } from "../questionnaire/dimension-branch-chat-hints.constants";
import { parseP6DimensionBranchHintsProposedPatch } from "../profile-suggestion/parse-p6-dimension-branch-hints-patch";
import { ProfileSuggestionService } from "../profile-suggestion/profile-suggestion.service";
import { ConversationProfileCompletionChatCompletionsClient } from "./conversation-profile-completion-chat-completions.client";
import { CONVERSATION_PROFILE_COMPLETION_MODEL_SYSTEM_PROMPT } from "./conversation-profile-completion-model.prompt";
import { mapModelJsonToProfileCompletionDimensionHints } from "./conversation-profile-completion-model.mapper";
import { ChatService } from "./chat.service";

const MAX_TRANSCRIPT_CHARS = 14_000;

@Injectable()
export class ConversationProfileCompletionService {
  constructor(
    private readonly chatService: ChatService,
    private readonly profileSuggestionService: ProfileSuggestionService,
    private readonly chatClient: ConversationProfileCompletionChatCompletionsClient,
  ) {}

  async generateProfileCompletionSuggestion(
    conversationId: string,
    tokenUserId: string,
  ): Promise<ProfileUpdateSuggestion> {
    const conversation = await this.chatService.getConversationWithMessages(
      conversationId,
      tokenUserId,
    );

    if (conversation.messages.length === 0) {
      throw new UnprocessableEntityException(
        "Conversation has no messages; add messages before requesting a profile-completion suggestion",
      );
    }

    const tailMessage =
      conversation.messages[conversation.messages.length - 1]!;

    await this.profileSuggestionService.throwIfPendingP6ChatProfileCompletionExists(
      tokenUserId,
      conversationId,
    );

    await this.assertNoNewMessagesSinceLastP6Suggestion(
      tokenUserId,
      conversationId,
      tailMessage.id,
    );

    const userPrompt = this.buildUserPrompt(conversationId, conversation);
    const llm = await this.chatClient.complete(
      CONVERSATION_PROFILE_COMPLETION_MODEL_SYSTEM_PROMPT,
      userPrompt,
    );

    if (!llm.ok) {
      if (llm.kind === "disabled" || llm.kind === "missing_api_key") {
        throw new ServiceUnavailableException(
          "LLM profile-completion is disabled or not configured (PROFILE_COMPLETION_AI_ENABLED / PROFILE_COMPLETION_AI_API_KEY)",
        );
      }
      throw new BadGatewayException(
        llm.detail ?? `upstream chat completions failed: ${llm.kind}`,
      );
    }

    const mapped = mapModelJsonToProfileCompletionDimensionHints(llm.content);
    if (!mapped) {
      throw new UnprocessableEntityException(
        "Model output is not valid JSON or failed whitelist (schemaVersion/items)",
      );
    }

    const validated = parseP6DimensionBranchHintsProposedPatch({
      kind: P6_8_DIMENSION_BRANCH_HINTS_PATCH_KIND,
      schemaVersion: 1,
      items: mapped,
    });

    await this.profileSuggestionService.throwIfPendingP6ChatProfileCompletionExists(
      tokenUserId,
      conversationId,
    );

    const conversationAfter = await this.chatService.getConversationWithMessages(
      conversationId,
      tokenUserId,
    );

    if (conversationAfter.messages.length === 0) {
      throw new UnprocessableEntityException(
        "Conversation has no messages; add messages before requesting a profile-completion suggestion",
      );
    }

    const tailAfter =
      conversationAfter.messages[conversationAfter.messages.length - 1]!;

    await this.assertNoNewMessagesSinceLastP6Suggestion(
      tokenUserId,
      conversationId,
      tailAfter.id,
    );

    return this.profileSuggestionService.createP6ChatProfileCompletionSuggestion({
      tokenUserId,
      conversationId,
      hintItems: validated,
      generatedUpToMessageId: tailAfter.id,
    });
  }

  /**
   * R1: when the latest P6.8 row has a message cursor, block regeneration until a newer tail message exists.
   * Historical rows with null `generatedUpToMessageId` do not trigger this gate.
   */
  private async assertNoNewMessagesSinceLastP6Suggestion(
    tokenUserId: string,
    conversationId: string,
    tailMessageId: string,
  ): Promise<void> {
    const latest =
      await this.profileSuggestionService.findLatestP6ChatProfileCompletionForConversation(
        tokenUserId,
        conversationId,
      );
    const anchor = latest?.generatedUpToMessageId;
    if (anchor == null || anchor === "") {
      return;
    }
    if (tailMessageId === anchor) {
      throw new UnprocessableEntityException(
        "No new chat messages since the last profile-completion suggestion for this conversation",
      );
    }
  }

  private buildUserPrompt(
    conversationId: string,
    conversation: {
      id: string;
      viewerUserId: string;
      candidateUserId: string;
      messages: { senderUserId: string; content: string; createdAt: Date }[];
    },
  ): string {
    const lines: string[] = [
      `conversationId: ${conversationId}`,
      `viewerUserId: ${conversation.viewerUserId}`,
      `candidateUserId: ${conversation.candidateUserId}`,
      "",
      "下面是会话消息（按时间升序）。请只输出系统提示要求的 JSON：",
      "",
    ];

    let used = lines.join("\n").length;
    for (const m of conversation.messages) {
      const iso = m.createdAt.toISOString();
      const piece = `[${iso}] senderUserId=${m.senderUserId}\n${m.content}\n`;
      if (used + piece.length > MAX_TRANSCRIPT_CHARS) {
        lines.push("…（后续消息因长度限制已截断）");
        break;
      }
      lines.push(piece);
      used += piece.length;
    }

    return lines.join("\n");
  }
}
