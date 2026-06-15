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
  }

  async getCart(userId: string): Promise <{cart: any[]}> {
    const cartKey = `cart:${userId}`;

    const cached = await this.redisService.getX(cartKey);
    if (cached) {
      return { cart: JSON.parse(cached) };
    }

    const cartItems = await this.prisma.cartItem.findMany({
      where: { userId },
      include: { product: true }
    });
    await this.redisService.setX(cartKey, JSON.stringify(cartItems), 60 * 60);
    return { cart: cartItems }
  }

  async updateCart(userId: string, productId: string, quantity: number): Promise<void> {
    const exsistCart = await this.prisma.cartItem.findUnique({
      where: { userId_productId: { userId, productId } }
    });
    if (!exsistCart) {
      throw new NotFoundException(`Item not found in cart`);
    }

    const product = await this.prisma.product.findUnique(
      { where: { id: productId }}
    );

    if (!product) {
      throw new NotFoundException(`Product ${productId} not found`);
    }

    if (product.stock < quantity) {
      throw new BadRequestException(`Insufficient stock for product ${productId}`);
    }

    await this.prisma.cartItem.update({
      where: { id: exsistCart.id },
      data: { quantity }
    });

    await this.redisService.delX(`cart:${userId}`);
  }

  async removeFromCart(userId: string, productId: string) : Promise <void> {
    const existCart = await this.prisma.cartItem.findUnique(
      { where: { userId_productId: { userId, productId }} }
    );

    if (!existCart) {
      throw new NotFoundException('Item not found in cart');
    }

    await this.prisma.cartItem.delete(
      { where: { userId_productId: { userId, productId }}}
    );

    await this.redisService.delX(`cart:${userId}`);
  }
}