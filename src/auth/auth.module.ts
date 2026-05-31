import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { EmailModule } from '../email/email.module';
import { JwtStrategy } from '../common/guards/jwt.strategy';
import { PassportModule } from '@nestjs/passport';


@Module({
  imports: [
    PrismaModule,
    RedisModule,
    ConfigModule,
    EmailModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule, RedisModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: config.get('JWT_ACCESS_EXPIRES') },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
