import { Body, Controller, Post, UseGuards } from "@nestjs/common";

import { CreateProductDto } from "./dto/create-product.dto";
import { ProductsService } from "./products.service";
import { RolesGuard } from "../common/guards/roles.guard";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { Roles, Role } from "../common/decorators/roles.decorator";

@Controller('products')
export class ProductsController {

	constructor(
	private productsService: ProductsService
	) {}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SELLER)
@Post()
create(@Body() createProductDto: CreateProductDto) {
	this.productsService.createProduct(createProductDto);
	return "Product created successfully";
}
}
