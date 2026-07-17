import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import Groq from 'groq-sdk';

@Injectable()
export class AiService {
  private groq: Groq;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.groq = new Groq({
      apiKey: this.config.get<string>('GROQ_API_KEY'),
    });
  }

  async getRecommendationsByUser(userId: string) {
    const orders = await this.prisma.order.findMany({
      where: { userId, status: 'COMPLETED' },
      include: {
        items: { include: { product: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    if (!orders.length) {
    return { recommendations: 'No purchase history found.' };
  }

  const purchasedProducts = orders
    .flatMap(o => o.items)
    .map(i => `${i.product.name} ($${i.product.price})`)
    .join(', ');

    const completion = await this.groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful e-commerce assistant that recommends products.',
        },
        {
          role: 'user',
          content: `A customer previously purchased: ${purchasedProducts}. 
                    Suggest 3 complementary products they might like. 
                    Be specific and brief.`,
        },
      ],
      max_tokens: 200,
    });

    return {
      basedOn: purchasedProducts,
      recommendations: completion.choices[0].message.content,
    };

}
