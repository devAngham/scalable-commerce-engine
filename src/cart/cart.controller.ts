import {
  Body,
  Request,
  Controller,
  Post,
  UseGuards,
  Get,
  Patch,
  Delete,
  Param,
} from "@nestjs/common";

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

  @Get()
  @UseGuards(JwtAuthGuard)
  get(@Request() req: any) {
    return this.cartService.getCart(req.user.id)
  }

  @Patch()
  @UseGuards(JwtAuthGuard)
  update(@Body() addToCart: AddToCartDto, @Request() req: any) {
    return this.cartService.updateCart(
      req.user.id,
      addToCart.productId,
      addToCart.quantity
    )
  }

  @Delete()
  @UseGuards(JwtAuthGuard)
  delete(@Param('productId') productId: string, @Request() req: any) {
    return this.cartService.removeFromCart(
      req.user.id,
      productId,
    )
  }
}