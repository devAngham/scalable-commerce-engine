import { Controller, Post, Request, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { OrdersService } from "./orders.service";

@Controller('orders')
export class OrdersController {
  
  constructor( private readonly ordersService: OrdersService) {}

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  checkout(@Request() req: any) {
    return this.ordersService.checkout(req.user.id);
  }
}
