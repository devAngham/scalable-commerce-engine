import { Injectable, NotFoundException } from "@nestjs/common";
import { CreateProductDto } from "./dto/create-product.dto";
import { PrismaService } from "../prisma/prisma.service"; 
import { UpdateProductDto } from "./dto/update-product.dto";

@Injectable()
export class ProductsService {

  constructor(private prisma: PrismaService) {}

  async createProduct( dto: CreateProductDto ): Promise<{ product: any }> {
    const product = await this.prisma.product.create({
      data: dto
    });
    return { product };
  }

  async findAll(): Promise<{ products: any[] }> {
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
    });
    return { products };
  }

  async findOne(id: string): Promise<{ product: any }> {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

  if (!product) {
    throw new NotFoundException(`Product with id ${id} not found`);
  }
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
    return { product: updatedProduct };
  }

  async remove(id: string) {
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

  return { message: `Product with id ${id} has been deactivated` };
}
}
