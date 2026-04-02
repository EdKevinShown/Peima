import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@peima/database";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CreateUserProfileDto } from "./dto/create-user-profile.dto";
import { UpdateUserProfileDto } from "./dto/update-user-profile.dto";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserProfileDto) {
    const data: Prisma.UserCreateInput = {
      phone: dto.phone,
      nickname: dto.nickname,
      gender: dto.gender ?? "",
      age: dto.age,
      city: dto.city ?? "",
      height: dto.height,
      education: dto.education ?? "",
      occupation: dto.occupation ?? "",
      relationshipGoal: dto.relationshipGoal ?? "",
      bio: dto.bio ?? "",
    };

    try {
      return await this.prisma.user.create({ data });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictException("Phone already exists");
      }
      throw e;
    }
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }

  async update(id: string, dto: UpdateUserProfileDto) {
    await this.findOne(id);

    const data: Prisma.UserUpdateInput = {};
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.nickname !== undefined) data.nickname = dto.nickname;
    if (dto.gender !== undefined) data.gender = dto.gender;
    if (dto.age !== undefined) data.age = dto.age;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.height !== undefined) data.height = dto.height;
    if (dto.education !== undefined) data.education = dto.education;
    if (dto.occupation !== undefined) data.occupation = dto.occupation;
    if (dto.relationshipGoal !== undefined) data.relationshipGoal = dto.relationshipGoal;
    if (dto.bio !== undefined) data.bio = dto.bio;

    try {
      return await this.prisma.user.update({
        where: { id },
        data,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictException("Phone already exists");
      }
      throw e;
    }
  }
}
