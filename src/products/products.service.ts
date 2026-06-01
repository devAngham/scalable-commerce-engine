import { Injectable } from "@nestjs/common";
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
}