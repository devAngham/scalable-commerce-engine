import { Controller, Get, Query } from "@nestjs/common";
import { SearchService } from "./search.service";

@Controller('search')
export class SearchController {

  constructor(private readonly searchService: SearchService) {}

  @Get()
  async search(
    @Query('q') query: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.searchService.searchProducts(
      query,
      minPrice ? Math.round(Number(minPrice) * 100) : undefined,
      maxPrice ? Math.round(Number(maxPrice) * 100) : undefined,
      categoryId,
    );
  }
}