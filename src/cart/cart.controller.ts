import { Body, Request, Controller, Post, UseGuards } from "@nestjs/common";

import { AddToCartDto } from "./dto/add-to-cart.dto";
import { CartService } from "./cart.service";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";

@Controller('cart')
export class CartController {

  constructor (
    private cartService: CartService
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() addToCart: AddToCartDto, @Request() req: any) {
    return this.cartService.addToCart(
      req.user.id,
      addToCart.productId,
      addToCart.quantity)
  }
}