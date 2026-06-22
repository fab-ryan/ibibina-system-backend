import { Injectable } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { UserRepository } from '../users/repositories';
import { User } from '../users/entities/user.entity';
import { LoginDto } from '../users/dto';
import { UnauthorizedException, BadRequestException, NotFoundException } from '@/core/exceptions';
import { MailService } from '../mail/mail.service';
import { SmsService } from '../sms/sms.service';
import { ForgotPasswordDto, ResetPasswordDto, VerifyResetOtpDto } from './dto/auth.dto';

interface JwtPayload {
  sub: string;
  groupId?: string;
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
    private readonly smsService: SmsService,
  ) {}

  // ─── Login ────────────────────────────────────────────────────────────────

  async login(dto: LoginDto): Promise<{ user: User; tokens: TokenPair }> {
    const user = await this.usersService.validateCredentials(dto);
    const tokens = await this.generateTokens(user);
    await this.storeRefreshToken(user.id, tokens.refreshToken);
    return { user, tokens };
  }

  // ─── Token Refresh ────────────────────────────────────────────────────────

  async refreshTokens(rawRefreshToken: string): Promise<TokenPair> {
    let payload: JwtPayload;

    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(rawRefreshToken, {
        secret: this.configService.get<string>('app.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token is invalid or has expired');
    }

    const user = await this.userRepository.findOne({ where: { id: payload.sub } });
    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('User not found or no refresh token stored');
    }

    const isMatch = await bcrypt.compare(rawRefreshToken, user.refreshToken);
    if (!isMatch) {
      throw new UnauthorizedException('Refresh token does not match');
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

  // ─── Forgot & Reset Password ──────────────────────────────────────────────

  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.usersService.findByIdentifier(dto.identifier);
    if (!user) {
      // Return success to avoid user enumeration
      return;
    }

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const hashedOtp = await bcrypt.hash(otp, 10);
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);

    user.resetOtp = hashedOtp;
    user.resetOtpExpiresAt = expiresAt;
    await this.userRepository.save(user);

    if (user.email && dto.identifier === user.email) {
      await this.mailService.sendPasswordResetOtp({
        to: user.email,
        name: user.fullName,
        otp,
      });
    } else if (user.phone && dto.identifier === user.phone) {
      await this.smsService.sendPasswordResetOtp(user.phone, otp);
    }
  }

  async verifyResetOtp(dto: VerifyResetOtpDto): Promise<{ token: string }> {
    const user = await this.usersService.findByIdentifier(dto.identifier);
    if (!user || !user.resetOtp || !user.resetOtpExpiresAt || new Date() > user.resetOtpExpiresAt) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    const isMatch = await bcrypt.compare(dto.otp, user.resetOtp);
    if (!isMatch) {
      throw new BadRequestException('Invalid OTP');
    }

    // OTP is valid. Clear it and issue a short-lived reset token
    user.resetOtp = undefined;
    user.resetOtpExpiresAt = undefined;
    await this.userRepository.save(user);

    const token = await this.jwtService.signAsync(
      { sub: user.id, purpose: 'password-reset' },
      {
        secret: this.configService.get<string>('app.jwtSecret'),
        expiresIn: '15m',
      },
    );

    return { token };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    let payload: { sub: string; purpose: string };

    try {
      payload = await this.jwtService.verifyAsync<{ sub: string; purpose: string }>(dto.token, {
        secret: this.configService.get<string>('app.jwtSecret'),
      });
    } catch {
      throw new UnauthorizedException('Reset token is invalid or has expired');
    }

    if (payload.purpose !== 'password-reset') {
      throw new UnauthorizedException('Invalid token purpose');
    }

    const user = await this.userRepository.findOne({ where: { id: payload.sub } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.password = dto.newPassword;
    user.refreshToken = undefined; // Invalidate current sessions
    
    await this.userRepository.save(user);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async generateTokens(user: User): Promise<TokenPair> {
    const payload: JwtPayload = {
      sub: user.id,
      groupId: user.groupId,
      email: user.email,
      phone: user.phone,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
    };

    const jwtSecret = this.configService.get<string>('app.jwtSecret', '');
    const jwtExpiresIn = this.configService.get<string>('app.jwtExpiresIn', '7d');
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
