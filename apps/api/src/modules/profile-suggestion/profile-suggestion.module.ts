import { Module } from "@nestjs/common";
import { ProfileSuggestionController } from "./profile-suggestion.controller";
import { ProfileSuggestionRepository } from "./profile-suggestion.repository";
import { ProfileSuggestionService } from "./profile-suggestion.service";

@Module({
  controllers: [ProfileSuggestionController],
  providers: [ProfileSuggestionService, ProfileSuggestionRepository],
  exports: [ProfileSuggestionService],
})
export class ProfileSuggestionModule {}
