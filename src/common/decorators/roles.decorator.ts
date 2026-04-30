import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../modules/users/enums/user-role.enum';

export const ROLE_KEY = 'roles';

export const Roles = (...roles: UserRole[]) => SetMetadata(ROLE_KEY, roles);
