import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit {
	private redis!: Redis;

	constructor(
		private readonly configService: ConfigService,
	) {}

	onModuleInit() {
		this.redis = new Redis(
		this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379'
		);
	}

	async setX(key: string, value: string, ttl: number) : Promise<void> {
		await this.redis.set(key, value, 'EX', ttl);
	}

	async getX(key: string) : Promise<string | null> {
		return await this.redis.get(key);
	}

	async delX(key: string) : Promise<void> {
		await this.redis.del(key);
	}

  async deletePattern(pattern: string): Promise<void> {
		const stream = this.redis.scanStream({
			match: pattern,
			count: 100,
		});

		const pipeline = this.redis.pipeline();

		let hasKeys = false;

		if (stream) {
			for await (const keys of stream) {
				if (keys.length) {
					pipeline.del(...keys);
					hasKeys = true;
				}
			}
		}

    if (hasKeys) await pipeline.exec();
  }
}
