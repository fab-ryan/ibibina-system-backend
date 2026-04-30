import { Injectable } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { UserRepository } from '../users/repositories';
import { User } from '../users/entities/user.entity';
import { LoginDto } from '../users/dto';
import { UnauthorizedException, BadRequestException } from '@/core/exceptions';
import { MailService } from '../mail/mail.service';

interface JwtPayload {
  sub: string;
  email?: string;
  phone?: string;
  role: string;
  isEmailVerified: boolean;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly userRepository: UserRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  // ─── Login ────────────────────────────────────────────────────────────────

  async login(dto: LoginDto): Promise<{ user: User; tokens: TokenPair }> {
    const user = await this.usersService.validateCredentials(dto);
    const tokens = await this.generateTokens(user);
    await this.storeRefreshToken(user.id, tokens.refreshToken);
    return { user, tokens };
  }

  // ─── Token Refresh ────────────────────────────────────────────────────────

  async refreshTokens(userId: string, rawRefreshToken: string): Promise<TokenPair> {
    const user = await this.usersService.findOne(userId);

    if (!user.refreshToken) {
      throw new UnauthorizedException('No active session found');
    }

    const tokenMatch = await bcrypt.compare(rawRefreshToken, user.refreshToken);
    if (!tokenMatch) {
      throw new UnauthorizedException('Refresh token is invalid or has been rotated');
    }

    const tokens = await this.generateTokens(user);
    await this.storeRefreshToken(user.id, tokens.refreshToken);
    return tokens;
  }

  // ─── Logout ───────────────────────────────────────────────────────────────

  async logout(userId: string): Promise<void> {
    await this.userRepository.update(userId, { refreshToken: undefined });
  }

  // ─── Current User ─────────────────────────────────────────────────────────

  async getMe(userId: string): Promise<User> {
    return this.usersService.findOne(userId);
  }

  // ─── Email Verification (admin only) ─────────────────────────────────────

  async sendEmailVerification(userId: string): Promise<{ token: string }> {
    const user = await this.usersService.findOne(userId);

    if (!user.isAdmin) {
      throw new BadRequestException('Email verification is only available for admin users');
    }
    if (user.isEmailVerified) {
      throw new BadRequestException('Email is already verified');
    }

    const token = await this.jwtService.signAsync(
      { sub: userId, purpose: 'email-verification' },
      {
        secret: this.configService.get<string>('app.jwtSecret'),
        expiresIn: '24h',
      },
    );

    const appUrl = this.configService.get<string>('APP_URL', 'http://localhost:3000');
    const verificationUrl = `${appUrl}/auth/verify-email?token=${token}`;

    await this.mailService.sendEmailVerification({
      to: user.email!,
      name: user.fullName,
      verificationUrl,
    });

    return { token };
  }

  async verifyEmail(token: string): Promise<void> {
    let payload: { sub: string; purpose: string };

    try {
      payload = await this.jwtService.verifyAsync<{ sub: string; purpose: string }>(token, {
        secret: this.configService.get<string>('app.jwtSecret'),
      });
    } catch {
      throw new UnauthorizedException('Verification token is invalid or has expired');
    }

    if (payload.purpose !== 'email-verification') {
      throw new UnauthorizedException('Token was not issued for email verification');
    }

    await this.userRepository.update(payload.sub, { isEmailVerified: true });
  }

  async resendVerificationEmail(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);

    if (user && !user.isEmailVerified) {
      await this.sendEmailVerification(user.id);
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async generateTokens(user: User): Promise<TokenPair> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
    };

    const jwtSecret = this.configService.get<string>('app.jwtSecret', '');
    const jwtExpiresIn = this.configService.get<string>('app.jwtExpiresIn', '15m');
    const refreshSecret = this.configService.get<string>('app.refreshSecret', '');
    const refreshExpiresIn = this.configService.get<string>('app.refreshExpiresIn', '7d');

    const sign = (opts: JwtSignOptions) => this.jwtService.signAsync(payload, opts);

    const [accessToken, refreshToken] = await Promise.all([
      sign({ secret: jwtSecret, expiresIn: jwtExpiresIn as JwtSignOptions['expiresIn'] }),
      sign({ secret: refreshSecret, expiresIn: refreshExpiresIn as JwtSignOptions['expiresIn'] }),
    ]);

    return { accessToken, refreshToken };
  }

  private async storeRefreshToken(userId: string, rawToken: string): Promise<void> {
    const hashed = await bcrypt.hash(rawToken, 10);
    await this.userRepository.update(userId, { refreshToken: hashed });
  }
}
