import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateOrUpdatePreferenceDto } from "../src/modules/preferences/dto/create-or-update-preference.dto";
import { UpdateUserProfileDto } from "../src/modules/users/dto/update-user-profile.dto";

describe("P7.5-r4-j / r4-j1 China region + structured profile DTOs", () => {
  describe("gender / nickname", () => {
    it("UpdateUserProfileDto accepts male/female gender", async () => {
      const dto = plainToInstance(UpdateUserProfileDto, { gender: "male" });
      expect(await validate(dto)).toHaveLength(0);
    });

    it("UpdateUserProfileDto rejects invalid gender", async () => {
      const dto = plainToInstance(UpdateUserProfileDto, { gender: "unknown" });
      const err = await validate(dto);
      expect(err.some((e) => e.property === "gender")).toBe(true);
    });

    it("UpdateUserProfileDto rejects nickname too short when provided", async () => {
      const dto = plainToInstance(UpdateUserProfileDto, { nickname: "x" });
      const err = await validate(dto);
      expect(err.some((e) => e.property === "nickname")).toBe(true);
    });
  });

  describe("province-level city / preferredCities (DTO @IsIn on city only)", () => {
    it.each([
      ["上海"],
      ["广东"],
      ["浙江"],
      ["四川"],
    ])("accepts provincial region User.city=%s", async (city: string) => {
      const dto = plainToInstance(UpdateUserProfileDto, { city });
      expect(await validate(dto)).toHaveLength(0);
    });

    it.each([
      ["深圳"],
      ["广州"],
      ["杭州"],
      ["成都"],
      ["Sydney"],
      ["Melbourne"],
    ])("rejects metropolitan city / AU city User.city=%s", async (city: string) => {
      const dto = plainToInstance(UpdateUserProfileDto, { city });
      expect((await validate(dto)).some((e) => e.property === "city")).toBe(true);
    });
  });

  describe("education whitelist", () => {
    it.each([["中专"], ["大专"], ["本科"], ["硕士"]])(
      "accepts education=%s",
      async (education: string) => {
        const dto = plainToInstance(UpdateUserProfileDto, { education });
        expect(await validate(dto)).toHaveLength(0);
      },
    );

    it("rejects AU-style education TAFE / Diploma", async () => {
      const dto = plainToInstance(UpdateUserProfileDto, {
        education: "TAFE / Diploma",
      });
      expect(
        (await validate(dto)).some((e) => e.property === "education"),
      ).toBe(true);
    });
  });

  describe("CreateOrUpdatePreferenceDto bounds", () => {
    it("rejects age outside 18–60", async () => {
      const dto = plainToInstance(CreateOrUpdatePreferenceDto, {
        minAge: 70,
        maxAge: 80,
        preferredCities: ["广东"],
      });
      expect(await validate(dto)).not.toHaveLength(0);
    });

    it("accepts bounded age + height + provincial preferredCities", async () => {
      const dto = plainToInstance(CreateOrUpdatePreferenceDto, {
        minAge: 25,
        maxAge: 35,
        minHeight: 160,
        maxHeight: 180,
        preferredCities: ["北京", "浙江"],
      });
      expect(await validate(dto)).toHaveLength(0);
    });
  });
});
