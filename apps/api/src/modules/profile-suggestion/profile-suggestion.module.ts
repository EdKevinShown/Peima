import { Module } from "@nestjs/common";
import { ProfileSuggestionController } from "./profile-suggestion.controller";
import { ChatProfileEvidenceV1Service } from "./chat-profile-evidence-v1.service";
import { ProfileSuggestionRepository } from "./profile-suggestion.repository";
import { ProfileSuggestionService } from "./profile-suggestion.service";

@Module({
  controllers: [ProfileSuggestionController],
  providers: [
    ProfileSuggestionService,
    ProfileSuggestionRepository,
    ChatProfileEvidenceV1Service,
  ],
  exports: [ProfileSuggestionService],
})
export class ProfileSuggestionModule {}
