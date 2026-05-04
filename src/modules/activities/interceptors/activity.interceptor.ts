import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuthUserType } from '@/common/middlewares/authenticate.middleware';
import { ActivitiesService } from '../activities.service';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class ActivityInterceptor implements NestInterceptor {
  constructor(private readonly activitiesService: ActivitiesService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const method = (request.method ?? '').toUpperCase();

    if (!MUTATION_METHODS.has(method)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: (data: unknown) => {
          const payload = this.buildPayload(request, data, undefined);
          void this.activitiesService.recordActivity(payload);
        },
        error: (error: unknown) => {
          const payload = this.buildPayload(request, undefined, error);
          void this.activitiesService.recordActivity(payload);
        },
      }),
    );
  }

  private buildPayload(
    request: Request,
    data: unknown,
    error: unknown,
  ): Parameters<ActivitiesService['recordActivity']>[0] {
    const actor = request.user;
    const basePath = this.extractBasePath(request);
    const type = this.resolveType(basePath);
    const action = this.resolveAction(request.method, request.url);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const response = (data ?? {}) as Record<string, unknown>;
    const metadata: Record<string, unknown> = {
      params: request.params,
      query: request.query,
      requestBody: this.redactSensitive(body),
    };

    if (error) {
      metadata.error = this.normalizeError(error);
    }

    return {
      type,
      action,
      method: request.method,
      path: this.stripQuery(request.originalUrl ?? request.url),
      actorId: actor?.sub,
      actorRole: actor?.role,
      actorGroupId: actor?.groupId,
      groupId:
        this.pickString(response, ['groupId']) ??
        this.pickString(body, ['groupId']) ??
        actor?.groupId,
      amount:
        this.pickNumber(response, ['amount', 'paidAmount']) ??
        this.pickNumber(body, ['amount', 'paidAmount']),
      currency: this.pickString(response, ['currency']) ?? this.pickString(body, ['currency']),
      status:
        this.pickString(response, ['status']) ??
        this.pickString(body, ['status']) ??
        (error ? 'failed' : 'success'),
      resourceType: type,
      resourceId:
        this.pickString(response, ['id']) ??
        this.pickString(request.params as Record<string, unknown>, ['id']),
      description: `${action} ${type}`,
      metadata,
      ipAddress: request.ip,
      userAgent: request.get('user-agent') ?? undefined,
    };
  }

  private resolveAction(method: string, url: string): string {
    const normalizedMethod = method.toUpperCase();
    const lowerUrl = url.toLowerCase();

    if (lowerUrl.includes('login')) return 'login';
    if (lowerUrl.includes('logout')) return 'logout';

    if (normalizedMethod === 'POST') return 'create';
    if (normalizedMethod === 'PUT' || normalizedMethod === 'PATCH') return 'update';
    if (normalizedMethod === 'DELETE') return 'delete';

    return 'action';
  }

  private resolveType(path: string): string {
    const segments = path.split('/').filter(Boolean);
    if (segments.length === 0) return 'system';

    const candidate =
      segments.find((segment) => !this.isPrefixSegment(segment) && !segment.startsWith(':')) ??
      segments[segments.length - 1] ??
      'system';
    if (candidate.endsWith('ies')) return `${candidate.slice(0, -3)}y`;
    if (candidate.endsWith('s')) return candidate.slice(0, -1);
    return candidate;
  }

  private isPrefixSegment(segment: string): boolean {
    const normalized = segment.toLowerCase();
    return normalized === 'api' || /^v\d+$/.test(normalized);
  }

  private extractBasePath(request: Request): string {
    const routePath = request.route?.path;
    const baseUrl = request.baseUrl ?? '';

    if (routePath && typeof routePath === 'string') {
      const cleanRoute = routePath.startsWith('/') ? routePath : `/${routePath}`;
      return `${baseUrl}${cleanRoute}`;
    }

    return request.path ?? request.url;
  }

  private stripQuery(path: string): string {
    return path.split('?')[0] ?? path;
  }

  private pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = obj[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
    }
    return undefined;
  }

  private pickNumber(obj: Record<string, unknown>, keys: string[]): number | undefined {
    for (const key of keys) {
      const value = obj[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }
    return undefined;
  }

  private redactSensitive(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.redactSensitive(item));
    }

    if (value && typeof value === 'object') {
      const source = value as Record<string, unknown>;
      const masked: Record<string, unknown> = {};

      for (const [key, val] of Object.entries(source)) {
        if (this.isSensitiveKey(key)) {
          masked[key] = '[REDACTED]';
          continue;
        }

        masked[key] = this.redactSensitive(val);
      }

      return masked;
    }

    return value;
  }

  private isSensitiveKey(key: string): boolean {
    const normalized = key.toLowerCase();
    return (
      normalized.includes('password') ||
      normalized.includes('token') ||
      normalized.includes('secret') ||
      normalized.includes('pin')
    );
  }

  private normalizeError(error: unknown): Record<string, unknown> {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
      };
    }

    return { message: 'Unknown error' };
  }
}
