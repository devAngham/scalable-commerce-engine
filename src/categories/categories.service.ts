import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService
  ) {}

  async create(dto: CreateCategoryDto) {
    await this.redisService.delX('categories:all');
    const category = await this.prisma.category.create({ data: dto });
    return { category };
  }

  async findAll() {
    const cachedCategories = await this.redisService.getX('categories:all');
    if (cachedCategories) {
      return { categories: JSON.parse(cachedCategories) };
    }

    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
    });
    await this.redisService.setX('categories:all', JSON.stringify(categories), 24*60*60);
    return { categories };
  }

  async findOne(id: string) {
    const cachedCategory = await this.redisService.getX(`category:${id}`);
    if (cachedCategory) {
      return { category: JSON.parse(cachedCategory) };
    }

    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException(`Category ${id} not found`);
    await this.redisService.setX(`category:${id}`, JSON.stringify(category), 24*60*60);
    return { category };
  }

  async findCategoryProducts(id: string) {
    const cachedCategory = await this.redisService.getX(`category:${id}:products`);
    if (cachedCategory) {
      return { category: JSON.parse(cachedCategory) };
    }

    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        products: { where: { isActive: true } },
      },
    });
    if (!category) throw new NotFoundException(`Category ${id} not found`);
    await this.redisService.setX(`category:${id}:products`, JSON.stringify(category), 24*60*60);
    return { category };
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Category ${id} not found`);
    const category = await this.prisma.category.update({
      where: { id },
      data: dto,
    });

    await this.redisService.delX(`category:${id}`);
    await this.redisService.delX(`category:${id}:products`);
    await this.redisService.delX('categories:all');
    return { category };
  }

  async remove(id: string) {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Category ${id} not found`);
    await this.prisma.category.update({
      where: { id },
      data: { isActive: false },
    });
    await this.redisService.delX(`category:${id}`);
    await this.redisService.delX(`category:${id}:products`);
    await this.redisService.delX('categories:all');
    return { message: `Category ${id} has been deactivated` };
  }
}
