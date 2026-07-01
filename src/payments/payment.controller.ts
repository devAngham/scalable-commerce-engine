import {
  Request,
  Body,
  Headers,
  Controller,
  Post,
  UseGuards,
} from "@nestjs/common";

import { PaymentService } from "./payment.service";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles, Role } from "../common/decorators/roles.decorator";

@Controller('payment')
export class PaymentController {

  constructor(
    private readonly paymentService: PaymentService,
  ){}

  @Post()
  @UseGuards(JwtAuthGuard)
  createPaymentIndent(@Request() req: any, @Body() body: { orderId: string }) {
    return this.paymentService.createPaymentIndent(
      body.orderId,
    )
  }

  @Post('/webhook')
  verifyPayment(@Request() req:any, @Headers('stripe-signature') signature: string) {
    return this.paymentService.verifyPayment(req.body, signature)
  }

  @Post('/refund')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  refundPayment(@Request() req: any, @Body() body: { orderId: string }) {
    return this.paymentService.refundPayment(body.orderId);
  }
}