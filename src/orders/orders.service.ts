import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { OrderStatus } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { EventsGateway } from "../events/events.gateway";

@Injectable()
export class OrdersService {

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly eventsGateway: EventsGateway
  ){}

  async checkout(userId: string): Promise <{ order: any }> {

    const existingOrder = await this.prisma.order.findFirst({
      where: { userId, status: { in: ['PENDING', 'PAYMENT_PENDING'] } }
    });
    if (existingOrder) {
      throw new BadRequestException('You already have a pending order.');
    }

    let totalCents = 0;

    const order = await this.prisma.$transaction( async (tx) => {

      const cart = await tx.cartItem.findMany({
        where: { userId },
        include: { product: true}
      });

      if (!cart.length) {
        throw new NotFoundException('Cart is empty')
      }

      const newOrder = await tx.order.create({
        data: { userId, totalCents, status: 'PENDING' }
      })

      for (const item of cart) {
      if (!item.product.isActive) {
        throw new BadRequestException(`Product ${item.product.name} is no longer available`);
      }

      const locked = await tx.$queryRaw<{stock: number }[]>`
        SELECT stock FROM "Product" WHERE id = ${item.productId} FOR UPDATE
      `;
      const currentStock = locked[0].stock;

      if (currentStock < item.quantity) {
        throw new BadRequestException(`Not enough stock for ${item.product.name}`);
      }

      totalCents += item.product.priceCents * item.quantity;

      await tx.orderItem.create({
        data: {
          orderId: newOrder.id,
          productId: item.productId,
          quantity: item.quantity,
          priceCents: item.product.priceCents,
        }
      })
       await tx.product.update(
        { where: { id: item.productId },
        data: { stock: currentStock - item.quantity}
      });
    }
    await tx.order.update({
      where: { id: newOrder.id },
      data: { totalCents },
    });

    await tx.cartItem.deleteMany({ where: { userId } });

    newOrder.totalCents = totalCents;
    return newOrder;
  });

  await this.redisService.delX(`cart:${userId}`);
  await this.redisService.deletePattern('products:all');

  for (const item of cart) {
    await this.redisService.delX(`product:${item.productId}`);
  }

  return { order };

  }

  async updateOrderStatus(
    orderId: string,
    status: OrderStatus,
  ): Promise<{ order: any }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: status as OrderStatus },
    });

    this.eventsGateway.server
    .to(`user-${order.userId}`)
    .emit('orderStatusUpdated', {
      orderId: updatedOrder.id,
      status: updatedOrder.status,
    });

    return { order: updatedOrder };
  }
}