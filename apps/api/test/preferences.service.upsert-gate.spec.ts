import { BadRequestException } from "@nestjs/common";
import type { CreateOrUpdatePreferenceDto } from "../src/modules/preferences/dto/create-or-update-preference.dto";
import { PreferencesService } from "../src/modules/preferences/preferences.service";

describe("PreferencesService upsert (preferenceScore denom gate)", () => {
  const userId = "user-1";

  function makeService(mocks: {
    user: unknown | null;
    existingPref: unknown | null;
    createResult?: unknown;
    updateResult?: unknown;
  }) {
    const create = jest.fn().mockResolvedValue(mocks.createResult ?? {});
    const update = jest.fn().mockResolvedValue(mocks.updateResult ?? {});
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(mocks.user),
      },
      userPreference: {
        findUnique: jest.fn().mockResolvedValue(mocks.existingPref),
        create,
        update,
      },
    };
    const service = new PreferencesService(prisma as never);
    return { service, prisma, create, update };
  }

  it("rejects create when all matchable dimensions are empty", async () => {
    const { service, prisma, create } = makeService({
      user: { id: userId },
      existingPref: null,
    });
    await expect(service.upsertForUser(userId, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(create).not.toHaveBeenCalled();
    expect(prisma.userPreference.findUnique).toHaveBeenCalledWith({
      where: { userId },
    });
  });

  it("allows create when preferredCities is non-empty", async () => {
    const row = { id: "pref-1", userId };
    const { service, create } = makeService({
      user: { id: userId },
      existingPref: null,
      createResult: row,
    });
    await expect(
      service.upsertForUser(userId, { preferredCities: ["上海"] }),
    ).resolves.toEqual(row);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("rejects update that would clear every matchable dimension", async () => {
    const existing = {
      userId,
      minAge: 25,
      maxAge: 35,
      preferredCities: [],
      minHeight: null,
      maxHeight: null,
      educationPreferences: [],
      occupationPreferences: [],
      relationshipGoalPreferences: [],
      styleTags: [],
    };
    const { service, update } = makeService({
      user: { id: userId },
      existingPref: existing,
    });
    await expect(
      service.upsertForUser(userId, {
        minAge: null,
        maxAge: null,
      } as unknown as CreateOrUpdatePreferenceDto),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it("no-op update (empty body) does not run gate on legacy empty row", async () => {
    const existing = {
      userId,
      minAge: null,
      maxAge: null,
      preferredCities: [],
      minHeight: null,
      maxHeight: null,
      educationPreferences: [],
      occupationPreferences: [],
      relationshipGoalPreferences: [],
      styleTags: [],
    };
    const { service, update } = makeService({
      user: { id: userId },
      existingPref: existing,
    });
    await expect(service.upsertForUser(userId, {})).resolves.toEqual(existing);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects unknown preferredCities entry", async () => {
    const row = { id: "pref-1", userId };
    const { service, create } = makeService({
      user: { id: userId },
      existingPref: null,
      createResult: row,
    });
    await expect(
      service.upsertForUser(userId, {
        preferredCities: ["Mars"],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it("allows preferredCities 北京 + 广东", async () => {
    const row = { id: "pref-1", userId };
    const { service, create } = makeService({
      user: { id: userId },
      existingPref: null,
      createResult: row,
    });
    await expect(
      service.upsertForUser(userId, {
        preferredCities: ["北京", "广东"],
      }),
    ).resolves.toEqual(row);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("allows preferredCities 海外 + 其他", async () => {
    const row = { id: "pref-2", userId };
    const { service, create } = makeService({
      user: { id: userId },
      existingPref: null,
      createResult: row,
    });
    await expect(
      service.upsertForUser(userId, {
        preferredCities: ["海外", "其他"],
      }),
    ).resolves.toEqual(row);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it.each([
    [["深圳"]],
    [["Melbourne"]],
    [["成都", "深圳"]],
  ])("rejects non-whitelist preferredCities %#", async (cities: string[]) => {
    const { service, create } = makeService({
      user: { id: userId },
      existingPref: null,
    });
    await expect(
      service.upsertForUser(userId, { preferredCities: cities }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects photo focus chips in styleTags on account preferences", async () => {
    const existing = {
      userId,
      minAge: 25,
      maxAge: 35,
      preferredCities: [],
      minHeight: null,
      maxHeight: null,
      educationPreferences: [],
      occupationPreferences: [],
      relationshipGoalPreferences: [],
      styleTags: ["清爽自然"],
    };
    const { service, update } = makeService({
      user: { id: userId },
      existingPref: existing,
    });
    await expect(
      service.upsertForUser(userId, { styleTags: ["笑容"] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it("update without styleTags leaves existing styleTags untouched (patch-like upsert)", async () => {
    const existing = {
      userId,
      minAge: 25,
      maxAge: 35,
      preferredCities: [],
      minHeight: null,
      maxHeight: null,
      educationPreferences: [],
      occupationPreferences: [],
      relationshipGoalPreferences: [],
      styleTags: ["清爽自然", "生活感"],
    };
    const update = jest.fn().mockResolvedValue(existing);
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: userId }) },
      userPreference: {
        findUnique: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
        update,
      },
    };
    const service = new PreferencesService(prisma as never);
    await expect(
      service.upsertForUser(userId, { preferredCities: ["上海"] }),
    ).resolves.toEqual(existing);
    expect(update).toHaveBeenCalledWith({
      where: { userId },
      data: { preferredCities: ["上海"] },
    });
    expect(update.mock.calls[0]?.[0]?.data?.styleTags).toBeUndefined();
  });

  it("updates styleTags on existing preference (same row, no duplicate pref)", async () => {
    const existing = {
      userId,
      minAge: 25,
      maxAge: 35,
      preferredCities: [],
      minHeight: null,
      maxHeight: null,
      educationPreferences: [],
      occupationPreferences: [],
      relationshipGoalPreferences: [],
      styleTags: ["清爽自然", "生活感"],
    };
    const updated = { ...existing, styleTags: ["简约干净"] };
    const update = jest.fn().mockResolvedValue(updated);
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: userId }) },
      userPreference: {
        findUnique: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
        update,
      },
    };
    const service = new PreferencesService(prisma as never);
    await expect(
      service.upsertForUser(userId, { styleTags: ["简约干净"] }),
    ).resolves.toEqual(updated);
    expect(update).toHaveBeenCalledWith({
      where: { userId },
      data: { styleTags: ["简约干净"] },
    });
    expect(update).toHaveBeenCalledTimes(1);
  });
});
