import { UserRole } from '../modules/users/enums/user-role.enum';

export interface AuthUserType {
  sub: string;
  email?: string;
  phone?: string;
  role: UserRole;
  isEmailVerified: boolean;
  iat: number;
  exp: number;
}
