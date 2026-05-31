import { BullModule } from "@nestjs/bull/dist";
import { ConfigModule } from "@nestjs/config";
import { Module } from "@nestjs/common";

import { EmailService } from "./email.service";
import { EmailProcessor } from "./email.processor";

@Module({
	imports: [
		ConfigModule,
		BullModule.registerQueue({
			name: 'email',
		})
	],
	providers: [EmailService, EmailProcessor],
	exports: [EmailService],
})

export class EmailModule {
}
