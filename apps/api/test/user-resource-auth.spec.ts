import {
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Permission } from "@peima/shared/constants";
import { authorizeSelfUserAccess } from "../src/common/auth/authorize-self-user-access";
import { UsersController } from "../src/modules/users/users.controller";
import { UsersService } from "../src/modules/users/users.service";
import { PreferencesController } from "../src/modules/preferences/preferences.controller";
import { PreferencesService } from "../src/modules/preferences/preferences.service";
import { QuestionnaireController } from "../src/modules/questionnaire/questionnaire.controller";
import { QuestionnaireService } from "../src/modules/questionnaire/questionnaire.service";
import { RbacService } from "../src/common/rbac/rbac.service";

function mockRbac(checkPermission: jest.Mock) {
  return { checkPermission };
}

describe("authorizeSelfUserAccess", () => {
  it("throws UnauthorizedException when token user is missing", async () => {
    const rbac = mockRbac(jest.fn());
    await expect(
      authorizeSelfUserAccess(rbac as never, {
        tokenUserId: undefined,
        requestedUserId: "u1",
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("allows self access without RBAC check", async () => {
    const checkPermission = jest.fn();
    await authorizeSelfUserAccess(mockRbac(checkPermission) as never, {
      tokenUserId: "u1",
      requestedUserId: "u1",
    });
    expect(checkPermission).not.toHaveBeenCalled();
  });

  it("throws ForbiddenException when accessing another user without permission", async () => {
    const checkPermission = jest.fn().mockResolvedValue(false);
    await expect(
      authorizeSelfUserAccess(mockRbac(checkPermission) as never, {
        tokenUserId: "u1",
        requestedUserId: "u2",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(checkPermission).toHaveBeenCalledWith(
      "u1",
      Permission.MANAGE_PERMISSIONS,
    );
  });

  it("allows admin with MANAGE_PERMISSIONS to access another user", async () => {
    const checkPermission = jest.fn().mockResolvedValue(true);
    await authorizeSelfUserAccess(mockRbac(checkPermission) as never, {
      tokenUserId: "admin-1",
      requestedUserId: "u2",
    });
    expect(checkPermission).toHaveBeenCalled();
  });
});

describe("UsersController resource auth", () => {
  async function createController(checkPermission = jest.fn().mockResolvedValue(false)) {
    const usersService = {
      findOne: jest.fn().mockResolvedValue({ id: "u1", phone: "13800000001" }),
      update: jest.fn().mockResolvedValue({ id: "u1", nickname: "ok" }),
    };
    const mod = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: usersService },
        { provide: RbacService, useValue: mockRbac(checkPermission) },
      ],
    }).compile();
    return {
      controller: mod.get(UsersController),
      usersService,
      checkPermission,
    };
  }

  it("GET returns 401 when unauthenticated", async () => {
    const { controller } = await createController();
    await expect(controller.findOne("u1", {} as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("GET returns 403 when user A reads user B", async () => {
    const { controller } = await createController();
    await expect(
      controller.findOne("u2", { user: { userId: "u1" } } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("GET succeeds for self", async () => {
    const { controller, usersService } = await createController();
    const out = await controller.findOne("u1", {
      user: { userId: "u1" },
    } as never);
    expect(usersService.findOne).toHaveBeenCalledWith("u1");
    expect(out).toMatchObject({ id: "u1" });
  });

  it("PATCH returns 403 when user A updates user B", async () => {
    const { controller } = await createController();
    await expect(
      controller.update("u2", { nickname: "hack" } as never, {
        user: { userId: "u1" },
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("PATCH succeeds for self", async () => {
    const { controller, usersService } = await createController();
    await controller.update(
      "u1",
      { nickname: "self" } as never,
      { user: { userId: "u1" } } as never,
    );
    expect(usersService.update).toHaveBeenCalledWith("u1", { nickname: "self" });
  });
});

describe("PreferencesController resource auth", () => {
  async function createController(checkPermission = jest.fn().mockResolvedValue(false)) {
    const preferencesService = {
      upsertForUser: jest.fn().mockResolvedValue({ userId: "u1" }),
      getForUser: jest.fn().mockResolvedValue({ userId: "u1", styleTags: [] }),
    };
    const mod = await Test.createTestingModule({
      controllers: [PreferencesController],
      providers: [
        { provide: PreferencesService, useValue: preferencesService },
        { provide: RbacService, useValue: mockRbac(checkPermission) },
      ],
    }).compile();
    return {
      controller: mod.get(PreferencesController),
      preferencesService,
    };
  }

  it("GET returns 401 when unauthenticated", async () => {
    const { controller } = await createController();
    await expect(
      controller.findForUser("u1", {} as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("GET returns 403 when user A reads user B preferences", async () => {
    const { controller } = await createController();
    await expect(
      controller.findForUser("u2", { user: { userId: "u1" } } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("PUT returns 403 when user A writes user B preferences", async () => {
    const { controller } = await createController();
    await expect(
      controller.upsert("u2", { styleTags: ["清爽自然"] } as never, {
        user: { userId: "u1" },
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("PUT succeeds for self", async () => {
    const { controller, preferencesService } = await createController();
    await controller.upsert(
      "u1",
      { styleTags: ["清爽自然"] } as never,
      { user: { userId: "u1" } } as never,
    );
    expect(preferencesService.upsertForUser).toHaveBeenCalledWith("u1", {
      styleTags: ["清爽自然"],
    });
  });
});

describe("QuestionnaireController profile auth", () => {
  async function createController(checkPermission = jest.fn().mockResolvedValue(false)) {
    const questionnaireService = {
      getProfileForUser: jest.fn().mockResolvedValue({ profile: { userId: "u1" } }),
      getQuestionBank: jest.fn(),
      submit: jest.fn(),
    };
    const mod = await Test.createTestingModule({
      controllers: [QuestionnaireController],
      providers: [
        { provide: QuestionnaireService, useValue: questionnaireService },
        { provide: RbacService, useValue: mockRbac(checkPermission) },
      ],
    }).compile();
    return {
      controller: mod.get(QuestionnaireController),
      questionnaireService,
    };
  }

  it("GET profile returns 401 when unauthenticated", async () => {
    const { controller } = await createController();
    await expect(
      controller.getProfile("u1", {} as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("GET profile returns 403 when user A reads user B", async () => {
    const { controller } = await createController();
    await expect(
      controller.getProfile("u2", { user: { userId: "u1" } } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("GET profile succeeds for self", async () => {
    const { controller, questionnaireService } = await createController();
    const out = await controller.getProfile("u1", {
      user: { userId: "u1" },
    } as never);
    expect(questionnaireService.getProfileForUser).toHaveBeenCalledWith("u1");
    expect(out).toMatchObject({ profile: { userId: "u1" } });
  });
});
