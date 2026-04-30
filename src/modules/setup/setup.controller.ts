import { Controller, Post, Get, Delete, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam } from '@nestjs/swagger';
import { SetupService } from './setup.service';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddEnvVariableDto {
  @ApiProperty({ example: 'DB_HOST', description: 'Environment variable key' })
  @IsNotEmpty()
  @IsString()
  key!: string;

  @ApiProperty({ example: 'localhost', description: 'Environment variable value' })
  @IsNotEmpty()
  @IsString()
  value!: string;

  @ApiProperty({ required: false, example: 'Database host', description: 'Optional description' })
  @IsOptional()
  @IsString()
  description?: string;
}

@ApiTags('Setup')
@Controller('setup')
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Run initial setup (create .env and validate variables)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Setup completed successfully' })
  async runSetup() {
    await this.setupService.setup();
    await this.setupService.validateEnvironmentVariables();
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Setup completed successfully',
    };
  }

  @Get('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate required environment variables' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Validation complete' })
  async validateEnv() {
    await this.setupService.validateEnvironmentVariables();
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Environment variables validated',
    };
  }

  @Post('env')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add or update an environment variable' })
  @ApiBody({ type: AddEnvVariableDto })
  @ApiResponse({ status: HttpStatus.OK, description: 'Environment variable saved' })
  async addEnvVariable(@Body() body: AddEnvVariableDto) {
    await this.setupService.addEnvironmentVariable(body.key, body.value, body.description);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: `Environment variable '${body.key}' saved`,
    };
  }

  @Delete('env/:key')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove an environment variable' })
  @ApiParam({ name: 'key', description: 'Environment variable key to remove' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Environment variable removed' })
  async removeEnvVariable(@Param('key') key: string) {
    await this.setupService.removeEnvironmentVariable(key);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: `Environment variable '${key}' removed`,
    };
  }
}
