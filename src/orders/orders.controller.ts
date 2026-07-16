import {
  Controller,
  Post,
  Request,
  UseGuards,
  Patch,
  Param,
  Body,
} from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { OrdersService } from "./orders.service";
import { Roles } from "../common/decorators/roles.decorator";
import { Role } from "../common/decorators/roles.decorator";
import { UpdateOrderStatusDto } from "./dto/update-order-status.dto";

@Controller('orders')
export class OrdersController {
  
  constructor( private readonly ordersService: OrdersService) {}

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  checkout(@Request() req: any) {
    return this.ordersService.checkout(req.user.id);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard)
  @Roles(Role.ADMIN)
  updateOrderStatus(
    @Param('id') id: string,
    @Body() body: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateOrderStatus(id, body.status);
  }
}
