import { Injectable, OnModuleInit } from '@nestjs/common';
import { ElasticsearchService } from '@nestjs/elasticsearch';


@Injectable()
export class SearchService implements OnModuleInit {

	private readonly index = 'products';

	constructor(private readonly elasticsearchService: ElasticsearchService) {}

	async onModuleInit() {
		const indexExists = await this.elasticsearchService.indices.exists({ index: this.index });
		if (!indexExists) {
			await this.elasticsearchService.indices.create({
				index: this.index,
				mappings: {
					properties: {
						name: { type: 'text' },
						createdAt: { type: 'date' },
						description: { type: 'text' },
						price: { type: 'float' },
						stock: { type: 'integer' },
						isActive: { type: 'boolean' },
						categoryId: { type: 'keyword' }
					}
				}
			});
		}
	}
}
