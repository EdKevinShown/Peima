import { Module } from "@nestjs/common";
import { PrismaModule } from "./common/prisma/prisma.module";
import { ImagesModule } from "./modules/images/images.module";
import { MatchingModule } from "./modules/matching/matching.module";
import { PreferencesModule } from "./modules/preferences/preferences.module";
import { PreviewPoolModule } from "./modules/preview-pool/preview-pool.module";
import { QuestionnaireModule } from "./modules/questionnaire/questionnaire.module";
import { UsersModule } from "./modules/users/users.module";
import { ChatModule } from "./modules/chat/chat.module";
import { AuthModule } from "./modules/auth/auth.module";
import { FeedbackModule } from "./modules/feedback/feedback.module";
import { ProfileSuggestionModule } from "./modules/profile-suggestion/profile-suggestion.module";
import { BehaviorSignalModule } from "./modules/behavior-signal/behavior-signal.module";
import { AnalyticsModule } from "./modules/analytics/analytics.module";
import { CopilotModule } from "./modules/copilot/copilot.module";

@Module({
  imports: [
    PrismaModule,
    UsersModule,
    PreferencesModule,
    ImagesModule,
    PreviewPoolModule,
    QuestionnaireModule,
    MatchingModule,
    ChatModule,
    FeedbackModule,
    ProfileSuggestionModule,
    BehaviorSignalModule,
    AnalyticsModule,
    CopilotModule,
    AuthModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
