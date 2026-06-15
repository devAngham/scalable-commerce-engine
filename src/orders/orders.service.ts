import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";

@Injectable()
export class OrdersService {

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService
  ){}

  async checkout(userId: string): Promise <{ order: any }> {

    const cart = await this.prisma.cartItem.findMany({
      where: { userId },
      include: { product: true}
    });

    if (!cart.length) {
      throw new NotFoundException('Cart is empty')
    }

    let totalPrice = 0;

    const order = await this.prisma.$transaction( async (tx) => {

      const newOrder = await tx.order.create({
        data: { userId, total: totalPrice, status: 'PENDING' }
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

      totalPrice += item.product.price * item.quantity;

      await tx.orderItem.create({
        data: {
          orderId: newOrder.id,
          productId: item.productId,
          quantity: item.quantity,
          price: item.product.price,
        }
      })
       await tx.product.update(
        { where: { id: item.productId },
        data: { stock: currentStock - item.quantity}
      });
    }
    await tx.order.update({
      where: { id: newOrder.id },
      data: { total: totalPrice },
    });

    await tx.cartItem.deleteMany({ where: { userId } });

    newOrder.total = totalPrice;
    return newOrder;
  });

  await this.redisService.delX(`cart:${userId}`);
  await this.redisService.deletePattern('products:all');

  for (const item of cart) {
    await this.redisService.delX(`product:${item.productId}`);
  }

  return { order };

  }

}