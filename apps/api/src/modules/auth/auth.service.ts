import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../../common/prisma/prisma.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private signToken(payload: { sub: string; phone: string }) {
    return this.jwt.sign(payload);
  }

  private async getPublicUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phone: true,
        nickname: true,
        gender: true,
        age: true,
        city: true,
        height: true,
        education: true,
        occupation: true,
        relationshipGoal: true,
        bio: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
    return user;
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException("phone already exists");
    }

    const user = await this.prisma.user.create({
      data: {
        phone: dto.phone,
        nickname: dto.nickname,
        gender: "",
        age: null,
        city: "",
        height: null,
        education: "",
        occupation: "",
        relationshipGoal: "",
        bio: "",
      },
      select: {
        id: true,
        phone: true,
        nickname: true,
        gender: true,
        age: true,
        city: true,
        height: true,
        education: true,
        occupation: true,
        relationshipGoal: true,
        bio: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const token = this.signToken({ sub: user.id, phone: user.phone });
    return { token, user };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
      select: { id: true, phone: true },
    });

    if (!user) {
      throw new NotFoundException("user not found");
    }

    const token = this.signToken({ sub: user.id, phone: user.phone });
    const publicUser = await this.getPublicUser(user.id);
    return { token, user: publicUser };
  }

  async me(userId: string) {
    return this.getPublicUser(userId);
  }
}
