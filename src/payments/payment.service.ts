import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

import Stripe from 'stripe';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '../notifications/notifications.service';


@Injectable()
export class PaymentService {

  private stripe: Stripe;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notificationsService: NotificationsService,
  ){
    this.stripe = new Stripe(this.config.get<string>('STRIPE_SECRET_KEY')!)
  }

  async createPaymentIndent(orderId: string) {
    const existOrder = await this.prisma.order.findUnique(
      { where: { id: orderId }},
    );
    if (!existOrder) {
      throw new NotFoundException('Order not exist');
    }

    let { totalCents, id, status } = existOrder;

    if (status === 'COMPLETED') {
      throw new BadRequestException('Order already completed');
    }

    if (status === 'PAYMENT_PENDING') {
      throw new BadRequestException('Payment already in progress');
    }

    if (status === 'CANCELLED') {
      throw new BadRequestException('Order was cancelled — please create a new order');
    }
    
    const result = await this.stripe.paymentIntents.create({
      amount: totalCents,
      currency: 'usd',
      metadata: { orderId: id },
      automatic_payment_methods: {
      enabled: true,
      allow_redirects: 'never',   // يمنع طرق الدفع اللي تحتاج redirect
        },
    });
    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'PAYMENT_PENDING' },
    });
    return { clientSecret: result.client_secret }
  }

  async verifyPayment(raw: any, signatureHeader: string) {
    let result;
    try {
      result = await this.stripe.webhooks.constructEvent(
        raw,
        signatureHeader,
        this.config.get<string>('STRIPE_WEBHOOK_SECRET')!
      );
      } catch (err) {
      throw new BadRequestException(`Webhook signature verification failed`);
    }

      const paymentIntent = result.data.object as any;
      const orderId = paymentIntent.metadata?.orderId;

      if (result.type === 'payment_intent.succeeded') {
        const lockedOrder = await this.prisma.$transaction(async (tx) => {
          const rows = await tx.$queryRaw<{ id: string; status: string; userId: string }[]>`
            SELECT id, status, "userId" FROM "Order" WHERE id = ${orderId} FOR UPDATE
          `;
          const order = rows[0];

          // race-condition prevention: if the order is already completed or cancelled,
          // we don't want to process it again, so we return early.
          if (!order || order.status !== 'PAYMENT_PENDING') return null;

          await tx.order.update({
            where: { id: orderId },
            data: { status: 'COMPLETED', paymentIntentId: paymentIntent.id }
          });

          return order;
        });

        if (lockedOrder) {
          // Sent outside the transaction: notification delivery is external I/O
          // (network call to the notifications provider) that shouldn't hold the
          // row lock or DB connection open, and a failure here must not roll back
          // the COMPLETED status that already committed.
          this.notificationsService.sendNotification(lockedOrder.userId, {
            title: 'Payment Successful',
            message: 'Your order has been paid successfully.',
            type: 'PAYMENT_SUCCESS'
          });
        }
      }

      if (result.type === 'payment_intent.payment_failed') {

        const order = await this.prisma.order.findUnique({
        where: { id: orderId }
      });

      if (!order || order.status !== 'PAYMENT_PENDING') return { received: true };
        const newAttempts = order.paymentAttempts + 1;
      if (newAttempts >= 3) {
        await this.prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: orderId },
          data: { status: 'CANCELLED', paymentAttempts: newAttempts },
        });

        const orderItems = await tx.orderItem.findMany({
          where: { orderId },
        });

        for (const item of orderItems) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });
        }
      });

      this.notificationsService.sendNotification(order.userId, {
        title: 'Order Updated',
        message: `
          Your order was cancelled after 3 failed payment attempts.
          Please create a new order to try again.
        `,
        type: 'ORDER_UPDATE',
      });

      } else  {
          await this.prisma.order.update({
            where: { id: orderId },
            data: { status: 'PENDING', paymentAttempts: newAttempts  }
          });
          this.notificationsService.sendNotification(order.userId, {
            title: 'Order Updated',
            message: `Payment failed. You have ${3 - newAttempts} attempt(s) remaining.`,
            type: 'ORDER_UPDATE',
          });
        }
      }
    return { received: true };
  }

  async refundPayment(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId }
    });
    if (!order) {
      throw new NotFoundException('Order not exist');
    }

    if (order.status === 'REFUNDED') {
      throw new BadRequestException('Order already refunded');
    }

    if (order.status !== 'COMPLETED' || !order.paymentIntentId) {
      throw new BadRequestException('Only completed orders can be refunded');
    }

    const refund = await this.stripe.refunds.create(
      { payment_intent: order.paymentIntentId },
      { idempotencyKey: `refund-${orderId}` }
    );

    // Restore stock for each item — the refunded order's products return to inventory
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'REFUNDED' },
      });

      const orderItems = await tx.orderItem.findMany({
        where: { orderId },
      });

      for (const item of orderItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }
    });

    
    this.notificationsService.sendNotification(order.userId, {
      title: 'Order Refunded',
      message: 'Your order has been refunded successfully.',
      type: 'ORDER_REFUND',
    });

    return { message: 'Order refunded successfully', refundId: refund.id };
  }
}
