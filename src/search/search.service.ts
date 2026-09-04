import { Injectable, OnModuleInit } from '@nestjs/common';
import { ElasticsearchService } from '@nestjs/elasticsearch';
import { Product } from '@prisma/client';


@Injectable()
export class SearchService implements OnModuleInit {

	private readonly index = 'products';

	constructor(private readonly elasticsearchService: ElasticsearchService) {}

	async onModuleInit() {
		try {
			const indexExists = await this.elasticsearchService.indices.exists({ index: this.index });
			if (!indexExists) {
				await this.elasticsearchService.indices.create({
					index: this.index,
					mappings: {
						properties: {
							name: { type: 'text' },
							createdAt: { type: 'date' },
							description: { type: 'text' },
							priceCents: { type: 'integer' },
							stock: { type: 'integer' },
							isActive: { type: 'boolean' },
							categoryId: { type: 'keyword' }
						}
					}
				});
			}
		} catch (error) {
			console.error('Elasticsearch not available — search disabled:', error);
		}
	}

	async indexProduct(product: Product) {
		return this.elasticsearchService.index({
			index: this.index,
			id: product.id,
			document: {
				name: product.name,
				createdAt: product.createdAt,
				description: product.description,
				priceCents: product.priceCents,
				stock: product.stock,
				isActive: product.isActive,
				categoryId: product.categoryId,
			}
		});
	}

	async removeProduct(productId: string) {
		return this.elasticsearchService.delete({
			index: this.index,
			id: productId,
		})
		.catch(() => null); 
	}

	async searchProducts(
		query: string,
		minPriceCents?: number,
		maxPriceCents?: number,
		categoryId?: string,
	) {
		const hits = await this.elasticsearchService.search({
			index: this.index,
			query: {
				bool: {
					must: query
						? [
								{
									multi_match: {
										query: query,
										fields: ['name', 'description'],
										fuzziness: 'AUTO',
									},
								},
							]
						: [{ match_all: {} }],
					filter: [
						...(minPriceCents !== undefined ? [{ range: { priceCents: { gte: minPriceCents } } }] : []),
						...(maxPriceCents !== undefined ? [{ range: { priceCents: { lte: maxPriceCents } } }] : []),
						...(categoryId !== undefined ? [{ term: { categoryId } }] : [])
					]
				}
			}
		});
		return hits?.hits?.hits.map(hit => ({
			id: hit._id,
			...(hit._source as object),
		})) || [];
	}
}
