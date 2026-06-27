import { Injectable, NotFoundException } from '@nestjs/common';
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
    });
    return { clientSecret: result.client_secret }
  }
}