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
    .map(i => `${i.product.name} ($${(i.product.priceCents / 100).toFixed(2)})`)
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

  async getRecommendationsByProduct(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { category: true },
    });

    if (!product) {
      return { recommendations: 'Product not found.' };
    }

    const completion = await this.groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful e-commerce assistant that recommends products.',
        },
        {
          role: 'user',
          content: `A customer is viewing: ${product.name}
                    Category: ${product.category.name}
                    Price: $${(product.priceCents / 100).toFixed(2)}
                    Description: ${product.description}
                    Suggest 3 similar or complementary products. Be specific and brief.`,
        },
      ],
      max_tokens: 200,
    });

    return {
      basedOn: product.name,
      recommendations: completion.choices[0].message.content,
    };
  }

}
