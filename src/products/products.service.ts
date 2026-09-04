import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Product } from "@prisma/client";
import { CreateProductDto } from "./dto/create-product.dto";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateProductDto } from "./dto/update-product.dto";
import { RedisService } from "../redis/redis.service";
import { SearchService } from "../search/search.service";

@Injectable()
export class ProductsService {

  constructor(
    private prisma: PrismaService,
    private redisService: RedisService,
    private searchService: SearchService
  ) {}

  async createProduct( dto: CreateProductDto ): Promise<{ product: Product }> {
    const existingProduct = await this.prisma.product.findUnique({
      where: { sku: dto.sku },
    });
    if (existingProduct) {
      throw new ConflictException(`Product with SKU ${dto.sku} already exists`);
    }
    const product = await this.prisma.product.create({
      data: dto
    });
    await this.redisService.deletePattern(`products:all`);
    await this.searchService.indexProduct(product);
    return { product };
  }

  async findAll(): Promise<{ products: Product[] }> {
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

  async findOne(id: string): Promise<{ product: Product }> {
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

  async updateProduct(id: string, dto: UpdateProductDto): Promise<{ product: Product }> {
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
    await this.searchService.indexProduct(updatedProduct);
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
  await this.searchService.removeProduct(id);
  return { message: `Product with id ${id} has been deactivated` };
}
}
