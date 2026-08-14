import { Injectable, ConflictException, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { RedisService as Redis } from '../redis/redis.service';

import { Request } from 'express';

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

  async register(dto: RegisterDto): Promise<any> {
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

    const code = randomInt(0, 1000000).toString().padStart(6, '0');
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

    if (!user.isEmailVerified) {
      throw new UnauthorizedException('Please verify your email first');
    }

    const refreshToken = this.createRefreshToken(user.id, user.email);
    await this.redis.setX(`refresh:${user.id}`, refreshToken, 7 * 24 * 60 * 60);
    return {
      accessToken: await this.createAccessToken(user.id, user.email),
      refreshToken,
    };
  }

  async verifyEmail(email: string, code: string, request: Request): Promise<any> {

    const attemptKey = `email-verification-attempts:${email}`;
    const attempts = await this.redis.getX(attemptKey);

    if (attempts && parseInt(attempts) >= 5) {
      await this.redis.setX(attemptKey, attempts, 600); // Reset the TTL to 10 minutes
      throw new UnauthorizedException('Too many attempts. Please try again later.');
    }

    const storedCode = await this.redis.getX(`email-verification:${email}`);
    if (!storedCode || storedCode !== code) {
      await this.redis.setX(attemptKey,
        String(parseInt(attempts || '0') + 1),
        600); // 10 minutes
      throw new UnauthorizedException('Invalid or expired verification code');
    }
    const user = await this.prisma.user.update({
      where: { email },
      data: { isEmailVerified: true },
    });

    
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        ip: request.ip || 'unknown',
        userAgent: request.headers['user-agent'] || 'unknown',
      },
    });
    // cache: session info
    await this.redis.setX(`session:${session.id}`, JSON.stringify(session), 7 * 24 * 60 * 60 ); // 7 days

    // cache: refresh token
    const refreshToken = await this.createRefreshToken(user.id, user.email);
    await this.redis.setX(`refresh:${user.id}:${session.id}`, refreshToken, 7 * 24 * 60 * 60);

    // clear: verification code & attempts no.
    await this.redis.delX(`email-verification:${email}`);
    await this.redis.delX(attemptKey); // Reset attempts on successful verification

    return {
      message: 'Email verified successfully',
      accessToken: await this.createAccessToken(user.id, user.email),
      refreshToken,
      sessionId: session.id,
    };
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
    const code = randomInt(0, 1000000).toString().padStart(6, '0');
    await this.redis.setX(`email-verification:${email}`, code, 10 * 60);
    await this.emailService.sendEmailVerification(email, code);
    return { message: 'Verification code resent' };
  }

  async refresh(refreshToken: string, sessionId: string): Promise<any> {
    const payload = this.verifyRefreshToken(refreshToken);
    const userId = payload.sub;

    const stored = await this.redis.getX(`refresh:${userId}:${sessionId}`);
  if (!stored || stored !== refreshToken) {
    throw new UnauthorizedException('Refresh token is invalid or expired');
  }

  await this.redis.delX(`refresh:${userId}:${sessionId}`);
  const newRefreshToken = await this.createRefreshToken(userId, payload.email);

  await this.redis.setX(
    `refresh:${userId}:${sessionId}`,
    newRefreshToken,
    7 * 24 * 60 * 60
  );
    return {
      accessToken: await this.createAccessToken(userId, payload.email),
      refreshToken: newRefreshToken,
      sessionId,
    };
  }

  async logout(_refreshToken: string, sessionId: string): Promise<{ message: string; }> {
    const payload = this.verifyRefreshToken(_refreshToken);
    // await this.redis.delX(`refresh:${payload.sub}`);
    await this.redis.delX(`refresh:${payload.sub}:session:${sessionId}`);
    await this.prisma.session.delete({ where: { id: sessionId } });
    return { message: 'Logged out successfully' };
  }

  async logoutAll(userId: string): Promise<{ message: string }> {
    await this.redis.deletePattern(`refresh:${userId}:*`);

    const sessions = await this.prisma.session.findMany({ where: { userId }});

    for (const session of sessions) {
    await this.redis.delX(`session:${session.id}`);
  }

    await this.prisma.session.deleteMany({
      where: { userId },
    });

    return { message: 'Logged out from all devices successfully' };
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
