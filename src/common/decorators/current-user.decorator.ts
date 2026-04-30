import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AuthUserType } from '../../types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUserType => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.user as unknown as AuthUserType;
  },
);
