import { Module, MiddlewareConsumer, NestModule } from "@nestjs/common";
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
import { SummaryAiModule } from "./modules/summary-ai/summary-ai.module";
import { MatchExplanationAiModule } from "./modules/match-explanation-ai/match-explanation-ai.module";
import { AdminModule } from "./modules/admin/admin.module";
import { TestModule } from "./modules/test/test.module";
import { RbacModule } from "./common/rbac/rbac.module";
import { SuggestionCenterModule } from "./modules/suggestion-center/suggestion-center.module";
import { AuditModule } from "./common/audit/audit.module";
import { AuditMiddleware } from "./common/middleware/audit.middleware";
import { EventsModule } from "./common/events/events.module";
import { NotificationModule } from "./modules/notifications/notification.module";

@Module({
  imports: [
    PrismaModule,
    EventsModule,
    RbacModule,
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
    SummaryAiModule,
    MatchExplanationAiModule,
    AdminModule,
    TestModule,
    SuggestionCenterModule,
    AuthModule,
    AuditModule,
    NotificationModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuditMiddleware).forRoutes('*');
  }
}
