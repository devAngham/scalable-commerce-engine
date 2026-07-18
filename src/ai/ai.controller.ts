import { Controller, Get, Param, Request, UseGuards } from '@nestjs/common';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('recommendations/user')
  @UseGuards(JwtAuthGuard)
  getRecommendationsByUser(@Request() req: any) {
    return this.aiService.getRecommendationsByUser(req.user.id);
  }

  @Get('recommendations/product/:id')
  getRecommendationsByProduct(@Param('id') id: string) {
    return this.aiService.getRecommendationsByProduct(id);
  }
}
