import { JwtService } from '@nestjs/jwt';
import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Response, Request, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';

export interface AuthUserType {
  sub: string;
  email?: string;
  phone?: string;
  role: string;
  isEmailVerified: boolean;
  iat: number;
  exp: number;
}

@Injectable()
export class AuthenticateMiddleware implements NestMiddleware {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    const [bearer, token] = authHeader.split(' ');
    if (bearer !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid Authorization header format');
    }

    try {
      const payload = await this.jwtService.verifyAsync<AuthUserType>(token, {
        secret: this.configService.get<string>('app.jwtSecret'),
      });
      req.user = payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    next();
  }
}

declare module 'express' {
  interface Request {
    user?: AuthUserType;
  }
}
