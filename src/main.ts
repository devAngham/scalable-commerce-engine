import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json, raw } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  console.log('Starting application...', process.env.PORT);

  // raw body فقط للـ webhook (للتحقق من التوقيع)
  app.use('/payment/webhook', raw({ type: 'application/json' }))

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
}

bootstrap();
