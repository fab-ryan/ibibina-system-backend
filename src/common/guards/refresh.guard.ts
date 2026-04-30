import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthUserType } from '../middlewares/authenticate.middleware';

declare module 'express' {
  interface Request {
    refreshToken?: string;
  }
}

@Injectable()
export class RefreshGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromCookie(request) || this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Refresh token is missing');
    }

    try {
      const payload = await this.jwtService.verifyAsync<AuthUserType>(token, {
        secret: this.configService.get<string>('app.refreshSecret'),
      });
      request.user = payload;
      // Expose raw token so the service can verify against stored hash
      request.refreshToken = token;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }

  private extractTokenFromCookie(request: Request): string | undefined {
    return (request.cookies as Record<string, string>)?.refresh_token;
  }
}
