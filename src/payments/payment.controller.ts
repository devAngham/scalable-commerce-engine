import { Request, Body, Headers, Controller, Post } from "@nestjs/common";
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

  @Post('/webhook')
  verifyPayment(@Request() req:any, @Headers('stripe-signature') signature: string) {
    return this.paymentService.verifyPayment(req.body, signature)
  }
}