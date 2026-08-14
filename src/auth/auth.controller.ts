import { Body, Controller, Post, Get, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { TokenDto } from './dto/token.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Throttle } from '@nestjs/throttler/dist';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('test')
  @UseGuards(JwtAuthGuard)
  test() {
    return { message: 'Auth module is working!' };
  }

  @Post('register')
  @Throttle({
    default: {
      ttl: 60000,
      limit: 10,
    },
  })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @Throttle({
    default: {
      ttl: 60000,
      limit: 5,
    },
  })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('verify-email')
  @Throttle({
    default: {
      ttl: 600000, // 10 minutes
      limit: 5, // 5 tries per 10 minutes
    },
  })
  verifyEmail(@Body() dto: { email: string; code: string }) {
    return this.authService.verifyEmail(dto.email, dto.code);
  }

  @Post('resend-verification')
  @Throttle({
    default: {
      ttl: 600000, // 3 tries per 10 minutes
      limit: 3,
    },
  })
  resendVerification(@Body() dto: { email: string }) {
    return this.authService.resendVerification(dto.email);
  }

  @Post('refresh')
  refresh(@Body() dto: TokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  logout(@Body() dto: TokenDto) {
    return this.authService.logout(dto.refreshToken);
  }
}
