import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, ConfigModule, NotificationsModule],
  controllers: [PaymentController],
  providers: [PrismaService, PaymentService],
  exports: [PaymentService]
})
export class PaymentModule {}
