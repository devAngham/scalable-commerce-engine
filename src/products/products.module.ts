import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, PrismaService, RedisService],
	exports: [ProductsService, PrismaService, RedisService]
})
export class ProductsModule {}
