import { Process, Processor } from '@nestjs/bull';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bull';

@Processor('email')
export class EmailProcessor {
  private transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST'),
      port: this.configService.get<number>('SMTP_PORT'),
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASS'),
      },
    })
  }

  @Process('send-email-verification')
  async handleSendEmailVerification(job: Job<{email: string, code: string}>) {
    await this.transporter.sendMail({
      from: `"Example Team" <${this.configService.get<string>('SMTP_FROM')}>`,
      to: job.data.email,
      subject: "Email Verification",
      html: `
        <p>
          <h2>Verify your email</h2>
          <p>Your verification code is:</p>
          <h1>${job.data.code}</h1>
          <p>This code expires in 10 minutes.</p>
        </p>`,
    })
  }
}
