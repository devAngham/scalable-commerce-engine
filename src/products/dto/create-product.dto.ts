import {
  IsString,
  IsInt,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsArray,
  Min
} from "class-validator";

export class CreateProductDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(1)
  priceCents!: number;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsArray()
  images?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsString()
  categoryId!: string;
}
