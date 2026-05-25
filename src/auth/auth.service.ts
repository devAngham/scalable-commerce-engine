import { Injectable, ConflictException, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async register(dto: RegisterDto): Promise<{ message: string }> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const [firstName, ...rest] = dto.name.trim().split(' ');
    const lastName = rest.length > 0 ? rest.join(' ') : undefined;

    await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        firstName,
        lastName,
      },
    });

    return { message: 'Registration successful' };
  }

  async login(dto: LoginDto): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      accessToken: this.createAccessToken(user.id, user.email),
      refreshToken: this.createRefreshToken(user.id, user.email),
    };
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    const payload = this.verifyRefreshToken(refreshToken);
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('Refresh token is invalid');
    }

    return { accessToken: this.createAccessToken(user.id, user.email) };
  }

  logout(_refreshToken: string): { message: string } {
    return { message: 'Logged out successfully' };
  }

  private createAccessToken(userId: string, email: string): string {
    return this.jwtService.sign(
      { sub: userId, email },
      {
        secret: this.getAccessSecret(),
        expiresIn: this.getAccessExpires(),
      },
    );
  }

  private createRefreshToken(userId: string, email: string): string {
    return this.jwtService.sign(
      { sub: userId, email },
      {
        secret: this.getRefreshSecret(),
        expiresIn: this.getRefreshExpires(),
      },
    );
  }

  private verifyRefreshToken(token: string): JwtPayload {
    try {
      return this.jwtService.verify<JwtPayload>(token, {
        secret: this.getRefreshSecret(),
      });
    } catch (error) {
      throw new UnauthorizedException('Refresh token is invalid');
    }
  }

  private getAccessSecret(): string {
    const secret = this.configService.get<string>('JWT_ACCESS_SECRET');
    if (!secret) {
      throw new InternalServerErrorException('JWT_ACCESS_SECRET is not configured');
    }
    return secret;
  }

  private getRefreshSecret(): string {
    const secret = this.configService.get<string>('JWT_REFRESH_SECRET');
    if (!secret) {
      throw new InternalServerErrorException('JWT_REFRESH_SECRET is not configured');
    }
    return secret;
  }

  private getAccessExpires(): string {
    return this.configService.get<string>('JWT_ACCESS_EXPIRES') || '15m';
  }

  private getRefreshExpires(): string {
    return this.configService.get<string>('JWT_REFRESH_EXPIRES') || '7d';
  }
}
