import { Request, Body, Controller, Post } from "@nestjs/common";
import { PaymentService } from "./payment.service";

@Controller('payment')
export class PaymentController {

  constructor(
    private readonly paymentService: PaymentService,
  ){}

  @Post()
  createPaymentIndent(@Request() req: any, @Body() body: { orderId: string }) {
    return this.paymentService.createPaymentIndent(
      body.orderId,
    )
  }
}