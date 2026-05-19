import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth } from '@/common/decorators/auth.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import * as authenticateMiddleware from '@/common/middlewares/authenticate.middleware';
import { TransactionsService } from './transactions.service';
import { TransactionFilterDto } from './dto/transaction.dto';

@ApiTags('Transactions')
@ApiBearerAuth()
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  @Auth()
  @ApiOperation({ summary: 'List transactions (scoped to actor role)' })
  findAll(
    @Query() filters: TransactionFilterDto,
    @CurrentUser() actor: authenticateMiddleware.AuthUserType,
  ) {
    return this.transactionsService.findAll(filters, actor);
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
}
