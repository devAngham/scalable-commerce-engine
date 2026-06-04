import { Injectable, NotFoundException } from "@nestjs/common";
import { CreateProductDto } from "./dto/create-product.dto";
import { PrismaService } from "../prisma/prisma.service"; 
import { UpdateProductDto } from "./dto/update-product.dto";
import { RedisService } from "../redis/redis.service";

@Injectable()
export class ProductsService {

  constructor(private prisma: PrismaService, private redisService: RedisService) {}

  async createProduct( dto: CreateProductDto ): Promise<{ product: any }> {
    const product = await this.prisma.product.create({
      data: dto
    });
    await this.redisService.deletePattern(`products:all`);
    return { product };
  }

  async findAll(): Promise<{ products: any[] }> {
    const cachedProducts = await this.redisService.getX('products:all');
    if (cachedProducts) {
      return { products: JSON.parse(cachedProducts) };
    }
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
    });

    await this.redisService.setX('products:all', JSON.stringify(products), 24*60*60);
    return { products };
  }

  async findOne(id: string): Promise<{ product: any }> {
    const cachedProduct = await this.redisService.getX(`product:${id}`);
    if (cachedProduct) {
      return { product: JSON.parse(cachedProduct) };
    }
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

  if (!product) {
    throw new NotFoundException(`Product with id ${id} not found`);
  }
    await this.redisService.setX(`product:${id}`, JSON.stringify(product), 24*60*60);
    return { product };
  }

  async updateProduct(id: string, dto: UpdateProductDto): Promise<{ product: any }> {
    const existingProduct = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!existingProduct) {
      throw new NotFoundException(`Product with id ${id} not found`); 
    }
    const updatedProduct = await this.prisma.product.update({
      where: { id },
      data: dto,
    });
    await this.redisService.delX(`product:${updatedProduct.id}`);
    await this.redisService.deletePattern(`products:all`); // Invalidate the all products cache
    return { product: updatedProduct };
  }

  async remove(id: string) {
  await this.redisService.delX(`product:${id}`);
  const existingProduct = await this.prisma.product.findUnique({
    where: { id },
  });

  if (!existingProduct) {
    throw new NotFoundException(`Product with id ${id} not found`);
  }

  await this.prisma.product.update({
    where: { id },
    data: { isActive: false },
  });

  await this.redisService.deletePattern(`products:all`); // Invalidate the all products cache
  return { message: `Product with id ${id} has been deactivated` };
}
}
