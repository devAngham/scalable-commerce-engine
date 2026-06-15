import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { RedisService } from '../redis/redis.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [OrdersService, RedisService],
  controllers: [OrdersController],
  exports: [OrdersService]
})
export class OrdersModule {}
