import { Injectable, ConflictException, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { RedisService as Redis } from '../redis/redis.service';

import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { EmailService } from '../email/email.service';

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
    private readonly redis: Redis,
    private readonly emailService: EmailService,
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

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        firstName,
        lastName,
      },
    });

    const code = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    await this.redis.setX(`email-verification:${dto.email}`, code, 10 * 60);
    await this.emailService.sendEmailVerification(dto.email, code);

    return {
      message: 'Registration successful',
    };
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

    const refreshToken = this.createRefreshToken(user.id, user.email);
    await this.redis.setX(`refresh:${user.id}`, refreshToken, 7 * 24 * 60 * 60);
    return {
      accessToken: await this.createAccessToken(user.id, user.email),
      refreshToken,
    };
  }

  async verifyEmail(email: string, code: string): Promise<{ message: string }> {
    const storedCode = await this.redis.getX(`email-verification:${email}`);
    if (!storedCode || storedCode !== code) {
      throw new UnauthorizedException('Invalid or expired verification code');
    }
    await this.prisma.user.update({
      where: { email },
      data: { isEmailVerified: true },
    });
    await this.redis.delX(`email-verification:${email}`);
    return { message: 'Email verified successfully' };
  }

  async resendVerification(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });
    if (!user) {
      throw new UnauthorizedException('Email not registered');
    }
    if (user.isEmailVerified) {
      return { message: 'Email is already verified' };
    }
    const code = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    await this.redis.setX(`email-verification:${email}`, code, 10 * 60);
    await this.emailService.sendEmailVerification(email, code);
    return { message: 'Verification code resent' };
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    const payload = this.verifyRefreshToken(refreshToken);

    const stored = await this.redis.getX(`refresh:${payload.sub}`);
  if (!stored || stored !== refreshToken) {
    throw new UnauthorizedException('Refresh token is invalid or expired');
  }

    return { accessToken: await this.createAccessToken(payload.sub, payload.email) };
  }

  async logout(_refreshToken: string): Promise<{ message: string; }> {
    const payload = this.verifyRefreshToken(_refreshToken);
    await this.redis.delX(`refresh:${payload.sub}`);
    return { message: 'Logged out successfully' };
  }

  private async createAccessToken(userId: string, email: string):  Promise<string> {
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
