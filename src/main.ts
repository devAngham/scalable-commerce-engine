import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { raw } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  console.log('Starting application...', process.env.PORT);

  // // Global validation pipe - run class-validator decorators
  app.useGlobalPipes(new ValidationPipe({
    // Strip properties not defined in the DTO — prevents unknown field injection
    whitelist: true,
    // Reject the request entirely if unknown fields are present (instead of silently stripping)
    forbidNonWhitelisted: true,
    // Automatically transform payloads to DTO types (e.g. string → number for @IsNumber())
    transform: true,
  }));

  // raw body فقط للـ webhook (للتحقق من التوقيع)
  app.use('/payment/webhook', raw({ type: 'application/json' }))

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
}

bootstrap();
