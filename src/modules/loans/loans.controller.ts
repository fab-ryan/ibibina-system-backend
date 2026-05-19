import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth } from '@/common/decorators/auth.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import * as authenticateMiddleware from '@/common/middlewares/authenticate.middleware';
import { ResponseService } from '@/common/services/response.service';
import { UserRole } from '@/modules/users/enums/user-role.enum';
import { LoansService } from './loans.service';
import {
  ApproveLoanDto,
  DisburseLoanDto,
  LoanFilterDto,
  LoanOverviewQueryDto,
  MarkRepaymentMissedDto,
  RecordRepaymentDto,
  RejectLoanDto,
  RepaymentFilterDto,
  RequestLoanDto,
} from './dto/loan.dto';

const ALL_ROLES = [
  UserRole.ADMIN,
  UserRole.CHAIRPERSON,
  UserRole.FINANCE,
  UserRole.SECRETARY,
  UserRole.MEMBER,
];

const STAFF = [UserRole.ADMIN, UserRole.CHAIRPERSON, UserRole.FINANCE, UserRole.SECRETARY];
const APPROVERS = [UserRole.ADMIN, UserRole.CHAIRPERSON, UserRole.FINANCE];
const DISBURSERS = [UserRole.ADMIN, UserRole.FINANCE, UserRole.CHAIRPERSON];

@ApiTags('Loans')
@ApiBearerAuth()
@Controller('loans')
export class LoansController {
  constructor(
    private readonly loansService: LoansService,
    private readonly responseService: ResponseService,
  ) {}

  // POST /loans — member or staff requesting a loan
  @Post()
  @Auth(...ALL_ROLES)
  @ApiOperation({ summary: 'Request a new loan' })
  @ApiResponse({ status: 201, description: 'Loan request submitted' })
  async request(
    @Body() dto: RequestLoanDto,
    @CurrentUser() actor: authenticateMiddleware.AuthUserType,
  ) {
    const loan = await this.loansService.request(dto, actor);
    return this.responseService.response({
      message: 'Loan request submitted successfully',
      data: loan,
    });
  }

  // GET /loans — staff lists all loans (scoped by group)
  @Get()
  @Auth(...STAFF)
  @ApiOperation({ summary: 'List loans (staff)' })
  async findAll(
    @Query() filters: LoanFilterDto,
    @CurrentUser() actor: authenticateMiddleware.AuthUserType,
  ) {
    const result = await this.loansService.findAll(filters, actor);
    return this.responseService.response({
      message: 'Loans retrieved successfully',
      data: result,
    });
  }

  // GET /loans/my — member lists their own loans
  @Get('my')
  @Auth(...ALL_ROLES)
  @ApiOperation({ summary: "Get the current user's loans" })
  async getMyLoans(@CurrentUser() actor: authenticateMiddleware.AuthUserType) {
    const data = await this.loansService.getMyLoans(actor);
    return this.responseService.response({
      message: 'Your loans retrieved successfully',
      data,
    });
  }

  @Get('eligibility')
  @Auth(...ALL_ROLES)
  @ApiOperation({ summary: 'Check loan eligibility and maximum amount' })
  async getAllowedLoanAmount(@CurrentUser() actor: authenticateMiddleware.AuthUserType) {
    const result = await this.loansService.getAllowedLoanAmount(actor);
    return this.responseService.response({
      message: 'Loan eligibility checked successfully',
      data: { ...result },
    });
  }

  @Get('staff/loans')
  @Auth(UserRole.ADMIN, UserRole.CHAIRPERSON, UserRole.FINANCE)
  @ApiOperation({
    summary: 'Loan overview: summary stats, loan list with overdue detection, member filter list',
  })
  async getLoanOverview(
    @CurrentUser() actor: authenticateMiddleware.AuthUserType,
    @Query() query: LoanOverviewQueryDto,
  ) {
    const overview = await this.loansService.getLoanOverview(actor, query);
    return this.responseService.response({
      success: true,
      data: overview,
      message: 'Loan overview retrieved successfully',
    });
  }

  // GET /loans/group/:groupId/summary — group-level stats
  @Get('group/:groupId/summary')
  @Auth(...STAFF)
  @ApiOperation({ summary: 'Get loan summary for a group' })
  @ApiParam({ name: 'groupId', type: 'string', format: 'uuid' })
  async getGroupSummary(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser() actor: authenticateMiddleware.AuthUserType,
  ) {
    const data = await this.loansService.getGroupSummary(groupId, actor);
    return this.responseService.response({
      message: 'Loan summary retrieved successfully',
      data,
    });
  }

  // GET /loans/:id — get a single loan
  @Get(':id')
  @Auth(...ALL_ROLES)
  @ApiOperation({ summary: 'Get a single loan by ID' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: authenticateMiddleware.AuthUserType,
  ) {
    const loan = await this.loansService.findOne(id, actor);
    return this.responseService.response({
      message: 'Loan retrieved successfully',
      data: loan,
    });
  }

  // GET /loans/:id/schedule — repayment schedule
  @Get(':id/schedule')
  @Auth(...ALL_ROLES)
  @ApiOperation({ summary: 'Get repayment schedule for a loan' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async getSchedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() filters: RepaymentFilterDto,
    @CurrentUser() actor: authenticateMiddleware.AuthUserType,
  ) {
    const data = await this.loansService.getRepaymentSchedule(id, filters, actor);
    return this.responseService.response({
      message: 'Repayment schedule retrieved successfully',
      data,
    });
  }

  // POST /loans/:id/approve
  @Post(':id/approve')
  @Auth(...APPROVERS)
  @ApiOperation({ summary: 'Approve a pending loan' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveLoanDto,
    @CurrentUser() actor: authenticateMiddleware.AuthUserType,
  ) {
    const loan = await this.loansService.approve(id, dto, actor);
    return this.responseService.response({
      message: 'Loan approved successfully',
      data: loan,
    });
  }

  // POST /loans/:id/reject
  @Post(':id/reject')
  @Auth(...APPROVERS)
  @ApiOperation({ summary: 'Reject a pending loan' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectLoanDto,
    @CurrentUser() actor: authenticateMiddleware.AuthUserType,
  ) {
    const loan = await this.loansService.reject(id, dto, actor);
    return this.responseService.response({
      message: 'Loan rejected successfully',
      data: loan,
    });
  }

  // POST /loans/:id/disburse
  @Post(':id/disburse')
  @Auth(...DISBURSERS)
  @ApiOperation({ summary: 'Disburse an approved loan' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async disburse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DisburseLoanDto,
    @CurrentUser() actor: authenticateMiddleware.AuthUserType,
  ) {
    const loan = await this.loansService.disburse(id, dto, actor);
    return this.responseService.response({
      message: 'Loan disbursed successfully',
      data: loan,
    });
  }

  // POST /loans/:id/repay — record the next pending installment payment
  @Post(':id/repay')
  @Auth(...ALL_ROLES)
  @ApiOperation({ summary: 'Record payment for the next pending installment' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async recordRepayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordRepaymentDto,
    @CurrentUser() actor: authenticateMiddleware.AuthUserType,
  ) {
    const repayment = await this.loansService.recordRepayment(id, dto, actor);
    return this.responseService.response({
      message: 'Repayment recorded successfully',
      data: repayment,
    });
  }

  // PATCH /loans/:id/repayments/:repaymentId/miss
  @Patch(':id/repayments/:repaymentId/miss')
  @Auth(...STAFF)
  @ApiOperation({ summary: 'Mark a pending installment as missed' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'repaymentId', type: 'string', format: 'uuid' })
  async markMissed(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('repaymentId', ParseUUIDPipe) repaymentId: string,
    @Body() dto: MarkRepaymentMissedDto,
    @CurrentUser() actor: authenticateMiddleware.AuthUserType,
  ) {
    const repayment = await this.loansService.markRepaymentMissed(id, repaymentId, dto, actor);
    return this.responseService.response({
      message: 'Installment marked as missed successfully',
      data: repayment,
    });
  }
}
