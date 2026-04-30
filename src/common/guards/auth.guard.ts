/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { AuthenticateMiddleware, AuthUserType } from '../middlewares/authenticate.middleware';
import { UserRole } from '../../modules/users/enums/user-role.enum';
import { ROLE_KEY } from '../decorators/roles.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authMiddleware: AuthenticateMiddleware,
    private readonly reflector: Reflector,
  ) {}

  matchRoles(requiredRoles: UserRole[], userRole: string): boolean {
    return requiredRoles.some((role) => {
      if (userRole === UserRole.ADMIN) return true;
      return role === userRole;
    });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Validate JWT and populate req.user
    await this.authMiddleware.use(
      context.switchToHttp().getRequest<Request>(),
      context.switchToHttp().getResponse<Response>(),
      () => {},
    );

    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<Request>();
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const user = request.user as AuthUserType | undefined;

    if (!user) {
      throw new UnauthorizedException('Unauthorized');
    }

    // No specific roles required — any authenticated user is allowed
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    if (!this.matchRoles(requiredRoles, user.role)) {
      throw new UnauthorizedException('Insufficient permissions');
    }

    return true;
  }
}
