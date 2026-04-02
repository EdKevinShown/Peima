import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import { CreateOrUpdatePreferenceDto } from "./dto/create-or-update-preference.dto";
import { PreferencesService } from "./preferences.service";

@Controller("preferences")
export class PreferencesController {
  constructor(private readonly preferencesService: PreferencesService) {}

  @Put(":userId")
  upsert(
    @Param("userId") userId: string,
    @Body() dto: CreateOrUpdatePreferenceDto,
  ) {
    return this.preferencesService.upsertForUser(userId, dto);
  }

  @Get(":userId")
  findForUser(@Param("userId") userId: string) {
    return this.preferencesService.getForUser(userId);
  }
}
