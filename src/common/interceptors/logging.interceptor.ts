import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import { Request } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url } = request;
    const body = request?.body as Record<string, unknown>;
    const params = request?.params as Record<string, unknown>;
    const query = request?.query as Record<string, unknown>;
    const headers = request?.headers as Record<string, unknown>;
    const requestId = (headers['x-request-id'] as string) || uuidv4();
    (request as any).requestId = requestId;

    // Set request start time
    const now = Date.now();

    this.logger.log({
      message: `Incoming request - ${method} ${url}`,
      requestId: requestId as string,
      method,
      url,
      body,
      params,
      query,
    });

    return next.handle().pipe(
      tap({
        next: (data) => {
          const responseTime = Date.now() - now;
          this.logger.log({
            message: `Response sent - ${method} ${url} - ${responseTime}ms`,
            requestId: requestId as string,
            responseTime,
            data: typeof data === 'object' ? data : { response: data },
          });
        },
        error: (error) => {
          const responseTime = Date.now() - now;
          this.logger.error({
            message: `Request failed - ${method} ${url} - ${responseTime}ms`,
            requestId: requestId as string,
            responseTime,
            error: {
              name: error.name as string,
              message: error.message as string,
              stack: error.stack as string,
            },
          });
        },
      }),
    );
  }
}
