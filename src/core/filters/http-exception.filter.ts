import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { I18nValidationException } from 'nestjs-i18n';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    let message: string;
    let errors: unknown = undefined;

    // Handle i18n validation exceptions
    if (exception instanceof I18nValidationException) {
      message = 'Validation failed';
      errors = exception.errors;
    } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const body = exceptionResponse as Record<string, unknown>;
      message = (body['message'] as string) || exception.message;
      errors = body['details'] ?? body['errors'];
    } else {
      message = exception.message;
    }

    const errorBody: Record<string, unknown> = {
      success: false,
      statusCode: status,
      message,
      path: request.url,
      method: request.method,
      timestamp: new Date().toISOString(),
    };

    if (errors !== undefined) {
      errorBody['errors'] = errors;
    }

    this.logger.warn(`[${request.method}] ${request.url} → ${status}: ${message}`);

    response.status(status).json(errorBody);
  }
}
