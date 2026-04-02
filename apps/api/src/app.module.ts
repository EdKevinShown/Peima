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
    AuthModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
