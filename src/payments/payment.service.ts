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

    const { total, id } = existOrder;
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
        await this.prisma.order.update({
          where: { id: orderId },
          data: { status: 'CANCELLED' }
        });
      }
      return { received: true };
    
    
  }
}