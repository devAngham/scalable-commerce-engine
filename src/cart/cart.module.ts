import { Module } from "@nestjs/common";
import { CartController } from "./cart.controller";
import { PrismaModule } from "../prisma/prisma.module";
import { RedisModule } from "../redis/redis.module";
import { CartService } from "./cart.service";

@Module({
  imports: [PrismaModule, RedisModule],
  providers: [CartService],
  controllers: [CartController],
  exports: [CartService]
})

export class CartModule {}