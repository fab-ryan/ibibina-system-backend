import * as fs from 'fs';
import * as path from 'path';
import { Body, Controller, Get, NotFoundException, Param, Post, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import express from 'express';
import { Auth, CurrentUser } from '@/common/decorators';
import * as authenticateMiddleware from '@/common/middlewares/authenticate.middleware';
import { UserRole } from '@/modules/users/enums/user-role.enum';
import { ResponseService } from '@/common/services/response.service';
import { ReportsService } from './reports.service';
import { GenerateReportDto, ReportListQueryDto } from './dto/report.dto';

@ApiTags('Reports')
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly responseService: ResponseService,
  ) {}

  @Get()
  @Auth(UserRole.ADMIN, UserRole.CHAIRPERSON, UserRole.FINANCE)
  @ApiOperation({ summary: 'List saved reports for the group' })
  async listReports(
    @CurrentUser() actor: authenticateMiddleware.AuthUserType,
    @Query() query: ReportListQueryDto,
  ) {
    const result = await this.reportsService.listReports(actor, query);
    return this.responseService.response({
      success: true,
      data: result,
      message: 'Reports retrieved successfully',
    });
  }

  @Get(':id')
  @Auth(UserRole.ADMIN, UserRole.CHAIRPERSON, UserRole.FINANCE)
  @ApiOperation({ summary: 'Get report metadata and Excel file URL' })
  async getReport(
    @CurrentUser() actor: authenticateMiddleware.AuthUserType,
    @Param('id') id: string,
  ) {
    const report = await this.reportsService.getReport(actor, id);
    return this.responseService.response({
      success: true,
      data: {
        id: report.id,
        name: report.name,
        type: report.type,
        period: report.period,
        size: report.sizeBytes,
        fileUrl: report.fileUrl,
        generatedBy: report.generatedBy
          ? `${report.generatedBy.firstName ?? ''} ${report.generatedBy.lastName ?? ''}`.trim()
          : null,
        createdAt: report.createdAt.toISOString().split('T')[0],
      },
      message: 'Report retrieved successfully',
    });
  }

  @Post('generate')
  @Auth(UserRole.ADMIN, UserRole.CHAIRPERSON, UserRole.FINANCE)
  @ApiOperation({
    summary: 'Generate and save a report',
    description:
      'period formats: monthly/meeting → "YYYY-MM", loans → "YYYY", audit → "YYYY-Q#" or "YYYY"',
  })
  async generateReport(
    @CurrentUser() actor: authenticateMiddleware.AuthUserType,
    @Body() dto: GenerateReportDto,
  ) {
    const report = await this.reportsService.generateReport(actor, dto);
    return this.responseService.response({
      success: true,
      data: report,
      message: 'Report generated successfully',
    });
  }

  @Get('files/:filename')
  @Auth(UserRole.ADMIN, UserRole.CHAIRPERSON, UserRole.FINANCE, UserRole.SECRETARY)
  @ApiOperation({ summary: 'Download a generated Excel report file' })
  downloadFile(@Param('filename') filename: string, @Res() res: express.Response) {
    // Prevent path traversal
    const safeFilename = path.basename(filename);
    const filePath = path.resolve(process.cwd(), 'public', 'reports', safeFilename);

    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('Report file not found');
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    fs.createReadStream(filePath).pipe(res);
  }
}
