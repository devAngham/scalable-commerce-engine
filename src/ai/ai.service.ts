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

    const availableProducts = await this.prisma.product.findMany({
      where: {
        isActive: true,
        id: { not: productId },
        stock: { gt: 0 },
      },
      take: 20,
      include: { category: true },
    });

    const productList = availableProducts
      .map(p =>  `- ${p.name} (ID: ${p.id}, Category: ${p.category.name}, Price: $${(p.priceCents/100).toFixed(2)})`)
      .join('\n');  

    const completion = await this.groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'You recommend products from a fixed catalog. Return ONLY product IDs, comma-separated, no explanation.',
        },
        {
          role: 'user',
          content: `Customer is viewing: ${product.name} (${product.category.name})
          
          Available products:
          ${productList}

          Return 3 product IDs from the list above that best complement the current product. Format: id1,id2,id3`,

        },
      ],
      max_tokens: 200,
    });

    // Parse IDs
    const returnedIds = completion.choices[0].message.content
      ?.split(',')
      .map(id => id.trim())
      .filter(Boolean) || [];

    // تحقق إن كل الـ IDs موجودة فعلاً (validation)
    const recommendedProducts = availableProducts.filter(p => 
      returnedIds.includes(p.id)
    );

    return {
      basedOn: product.name,
      recommendations: recommendedProducts,
    };
  }

}
