import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PostOnboardingPhotoPreferencesDto } from "./dto/post-onboarding-photo-preferences.dto";
import { OnboardingService } from "./onboarding.service";

type JwtReq = {
  user?: { userId: string };
};

@Controller("onboarding")
@UseGuards(JwtAuthGuard)
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get("photo/status")
  getPhotoStatus(@Req() req: JwtReq) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException("not authenticated");
    }
    return this.onboardingService.getPhotoStatus(userId);
  }

  @Post("photo-preferences")
  savePhotoPreferences(
    @Body() dto: PostOnboardingPhotoPreferencesDto,
    @Req() req: JwtReq,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException("not authenticated");
    }
    return this.onboardingService.savePhotoPreferences(userId, dto.styleTags);
  }

  @Get("photo-preferences/me")
  getPhotoPreferencesMe(@Req() req: JwtReq) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException("not authenticated");
    }
    return this.onboardingService.getPhotoPreferencesMe(userId);
  }
}
