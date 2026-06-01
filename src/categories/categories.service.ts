import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCategoryDto) {
    const category = await this.prisma.category.create({ data: dto });
    return { category };
  }

  async findAll() {
    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
    });
    return { categories };
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException(`Category ${id} not found`);
    return { category };
  }

  async findCategoryProducts(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        products: { where: { isActive: true } },
      },
    });
    if (!category) throw new NotFoundException(`Category ${id} not found`);
    return { category };
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Category ${id} not found`);
    const category = await this.prisma.category.update({
      where: { id },
      data: dto,
    });
    return { category };
  }

  async remove(id: string) {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Category ${id} not found`);
    await this.prisma.category.update({
      where: { id },
      data: { isActive: false },
    });
    return { message: `Category ${id} has been deactivated` };
  }
}
