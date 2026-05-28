import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth } from '@/common/decorators/auth.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import * as authenticateMiddleware from '@/common/middlewares/authenticate.middleware';
import { UserRole } from '@/modules/users/enums/user-role.enum';
import { TransactionsService } from './transactions.service';
import { TransactionFilterDto } from './dto/transaction.dto';
import { ResponseService } from '@/common/services/response.service';

@ApiTags('Transactions')
@ApiBearerAuth()
@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly transactionsService: TransactionsService,
    private responseService: ResponseService,
  ) {}

  @Get()
  @Auth()
  @ApiOperation({ summary: 'List transactions (scoped to actor role)' })
  async findAll(
    @Query() filters: TransactionFilterDto,
    @CurrentUser() actor: authenticateMiddleware.AuthUserType,
  ) {
    const result = await this.transactionsService.findAll(filters, actor);
    return this.responseService.response({
      data: result,
      message: 'Transactions retrieved successfully',
    });
  }

  @Get(':id')
  @Auth()
  @ApiOperation({ summary: 'Get a single transaction by id' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: authenticateMiddleware.AuthUserType,
  ) {
    return this.transactionsService.findOne(id, actor);
  }

  // ─── Upload bank reference file ────────────────────────────────────────────

  @Post('upload-reference')
  @HttpCode(HttpStatus.OK)
  @Auth(UserRole.ADMIN, UserRole.CHAIRPERSON, UserRole.FINANCE, UserRole.SECRETARY, UserRole.MEMBER)
  @ApiOperation({ summary: 'Upload a bank payment reference/proof file (max 5 MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  uploadReference(@UploadedFile() file: Express.Multer.File) {
    return this.transactionsService.uploadReference(file);
  }

  // ─── Paypack webhook ───────────────────────────────────────────────────────

  @Post('webhook/paypack')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Paypack payment webhook (internal use)' })
  async paypackWebhook(@Body() body: Record<string, unknown>) {
    await this.transactionsService.handlePaypackWebhook(body as any);
    return { received: true };
  }
}
