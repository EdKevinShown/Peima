import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { ProfileUpdateSuggestion } from "@peima/database";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CreateProfileSuggestionDto } from "./dto/create-profile-suggestion.dto";
import { ProfileSuggestionService } from "./profile-suggestion.service";

type JwtReq = {
  user?: { userId: string };
};

@Controller("profile-suggestions")
@UseGuards(JwtAuthGuard)
export class ProfileSuggestionController {
  constructor(
    private readonly profileSuggestionService: ProfileSuggestionService,
  ) {}

  @Post()
  create(
    @Body() dto: CreateProfileSuggestionDto,
    @Req() req: JwtReq,
  ): Promise<ProfileUpdateSuggestion> {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId) {
      throw new UnauthorizedException("not authenticated");
    }
    return this.profileSuggestionService.create(dto, tokenUserId);
  }

  @Get("mine")
  listMine(@Req() req: JwtReq): Promise<ProfileUpdateSuggestion[]> {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId) {
      throw new UnauthorizedException("not authenticated");
    }
    return this.profileSuggestionService.listMine(tokenUserId);
  }

  @Post(":suggestionId/accept")
  accept(
    @Param("suggestionId") suggestionId: string,
    @Req() req: JwtReq,
  ): Promise<ProfileUpdateSuggestion> {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId) {
      throw new UnauthorizedException("not authenticated");
    }
    return this.profileSuggestionService.accept(suggestionId, tokenUserId);
  }

  @Post(":suggestionId/dismiss")
  dismiss(
    @Param("suggestionId") suggestionId: string,
    @Req() req: JwtReq,
  ): Promise<ProfileUpdateSuggestion> {
    const tokenUserId = req.user?.userId;
    if (!tokenUserId) {
      throw new UnauthorizedException("not authenticated");
    }
    return this.profileSuggestionService.dismiss(suggestionId, tokenUserId);
  }
}
