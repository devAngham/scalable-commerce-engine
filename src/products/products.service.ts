import { Injectable, NotFoundException } from "@nestjs/common";
import { CreateProductDto } from "./dto/create-product.dto";
import { PrismaService } from "../prisma/prisma.service"; 

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
}