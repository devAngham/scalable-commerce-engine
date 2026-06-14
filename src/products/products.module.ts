import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SearchModule } from '../search/search.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [PrismaModule, RedisModule, SearchModule],
  controllers: [ProductsController],
  providers: [ProductsService],
	exports: [ProductsService]
})
export class ProductsModule {}
