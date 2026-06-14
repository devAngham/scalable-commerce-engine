import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";

@Injectable()
export class CartService {

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService
  ) {}

  async addToCart(userId: string, productId: string, quantity: number): Promise<void> {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });

    if (!product || !product.isActive) {
      throw new NotFoundException(`Product ${productId} not found or inactive`);
    }

    const cartKey = `cart:${userId}`;
    const cartItem = await this.prisma.cartItem.findUnique({
      where: { userId_productId: { userId, productId } },
    });
    if (cartItem) {
      const newQuantity = cartItem.quantity + quantity;
      if (product.stock < newQuantity) {
        throw new BadRequestException(`Insufficient stock for product ${productId}`);
      }
      await this.prisma.cartItem.update({
        where: { id: cartItem.id },
        data: { quantity: newQuantity },
      });
    } else {
      await this.prisma.cartItem.create({
        data: { userId, productId, quantity },
      });
    }
    await this.redisService.delX(cartKey);
    // await this.redisService.delX(`cart:${userId}:items`);
  }
}