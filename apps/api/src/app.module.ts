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
import { MatchReviewAiModule } from "./modules/match-review-ai/match-review-ai.module";
import { InteractionSimulationLiteModule } from "./modules/interaction-simulation-lite/interaction-simulation-lite.module";
import { MatchReadoutFusionModule } from "./modules/match-readout-fusion/match-readout-fusion.module";
import { AdminModule } from "./modules/admin/admin.module";
import { TestModule } from "./modules/test/test.module";
import { RbacModule } from "./common/rbac/rbac.module";
import { SuggestionCenterModule } from "./modules/suggestion-center/suggestion-center.module";
import { AuditModule } from "./common/audit/audit.module";
import { AuditMiddleware } from "./common/middleware/audit.middleware";
import { EventsModule } from "./common/events/events.module";
import { NotificationModule } from "./modules/notifications/notification.module";
import { PrescreenV0Module } from "./modules/prescreen-v0/prescreen-v0.module";
import { PostPoolDeepScreenModule } from "./modules/post-pool-deep-screen/post-pool-deep-screen.module";
import { AiSimulationV1Module } from "./modules/ai-simulation-v1/ai-simulation-v1.module";
import { AiPairwiseDecisionModule } from "./modules/ai-pairwise-decision/ai-pairwise-decision.module";
import { OnboardingModule } from "./modules/onboarding/onboarding.module";
import { AdminPhotoReviewModule } from "./modules/admin-photo-review/admin-photo-review.module";
import { P76AdminAllowlistApplyMetaModule } from "./modules/matching/p76-admin-allowlist-apply-meta.module";

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
    MatchReviewAiModule,
    InteractionSimulationLiteModule,
    MatchReadoutFusionModule,
    AdminModule,
    TestModule,
    SuggestionCenterModule,
    AuthModule,
    AuditModule,
    NotificationModule,
    PrescreenV0Module,
    PostPoolDeepScreenModule,
    AiSimulationV1Module,
    AiPairwiseDecisionModule,
    OnboardingModule,
    AdminPhotoReviewModule,
    P76AdminAllowlistApplyMetaModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuditMiddleware).forRoutes('*');
  }
}
