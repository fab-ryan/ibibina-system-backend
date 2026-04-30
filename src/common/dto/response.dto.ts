import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsNumber, IsString, IsOptional } from 'class-validator';
import { HttpStatus } from '@nestjs/common';
import { Exclude } from 'class-transformer';

export class ResponseDto {
  @ApiProperty({ required: true, readOnly: true })
  @IsBoolean()
  @IsNotEmpty()
  success!: boolean;

  @ApiProperty({ required: true })
  @IsNumber()
  statusCode!: HttpStatus;

  @ApiProperty({ required: true })
  @IsNotEmpty()
  message!: string;

  @ApiProperty({ required: false })
  data?: Record<string, any>;

  @Exclude()
  @ApiProperty({ required: false })
  key?: string;

  @ApiProperty({
    required: true,
  })
  @IsString()
  @IsOptional()
  path!: any;

  @ApiProperty({
    required: true,
  })
  @IsString()
  @IsOptional()
  method!: string;

  @ApiProperty({ required: false })
  requestId?: string;

  @ApiProperty({ required: true })
  @IsOptional()
  @IsNumber()
  timestamp!: string;
}
