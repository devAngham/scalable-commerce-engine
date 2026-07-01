import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

import Stripe from 'stripe';
import { ConfigService } from '@nestjs/config';


@Injectable()
export class PaymentService {

  private stripe: Stripe;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ){
    this.stripe = new Stripe(this.config.get<string>('STRIPE_SECRET_KEY')!)
  }

  async createPaymentIndent(orderId: string) {
    const existOrder = await this.prisma.order.findUnique(
      { where: { id: orderId }}
    );
    if (!existOrder) {
      throw new NotFoundException('Order not exist');
    }

    let { total, id, status } = existOrder;

    if (status === 'COMPLETED') {
      throw new BadRequestException('Order already completed');
    }

    if (status === 'CANCELLED') {
      throw new BadRequestException('Order was cancelled — please create a new order');
    }
    
    const result = await this.stripe.paymentIntents.create({
      amount: Math.round(total * 100),
      currency: 'usd',
      metadata: { orderId: id },
      automatic_payment_methods: {
      enabled: true,
      allow_redirects: 'never',   // يمنع طرق الدفع اللي تحتاج redirect
        },
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
        await this.prisma.order.update({
          where: { id: orderId },
          data: { status: 'COMPLETED' }
        });
      }

      if (result.type === 'payment_intent.payment_failed') {

        const order = await this.prisma.order.findUnique({
        where: { id: orderId }
      });

      if (!order || order.status !== 'PENDING') return { received: true };
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
      } else  {
          await this.prisma.order.update({
            where: { id: orderId },
            data: { status: 'PENDING', paymentAttempts: newAttempts  }
          });
        }
      }
  return { received: true };
}
}
