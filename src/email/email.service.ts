import { InjectQueue } from '@nestjs/bull/dist';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bull';

@Injectable()
export class EmailService {
	constructor(
		@InjectQueue('email') private readonly emailQueue: Queue,
	) {}

  async sendEmailVerification(email: string, code: string): Promise<void> {
    await this.emailQueue.add('send-email-verification', {
      email, code,
    });
  }
}
