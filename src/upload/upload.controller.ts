import { Controller, Post, UseGuards, UseInterceptors, UploadedFile } from "@nestjs/common";

import { UploadService } from './upload.service';
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { FileInterceptor } from "@nestjs/platform-express";

@Controller('upload')
export default class UploadController {
  constructor(
    private uploadService: UploadService,
  ) {}

  @Post('image')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', { storage: undefined }))
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    return await this.uploadService.uploadImage(file);
  }
}