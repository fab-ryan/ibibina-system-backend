import { Controller, Post, Get, Body, HttpCode, HttpStatus, UseGuards, Req } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { AuthResendVerificationEmailDto, VerifyEmailDto } from './dto/auth.dto';
import { LoginDto } from '../users/dto';
import { AuthGuard, RefreshGuard } from '@/common/guards';
import { Auth, CurrentUser, CurrentRefreshToken } from '@/common/decorators';
import * as authenticateMiddleware from '@/common/middlewares/authenticate.middleware';
import { ResponseService } from '@/common/services/response.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly responseService: ResponseService,
  ) {}

  /**
   * Login
   * - Admin: identifier = email, credential = password
   * - Others: identifier = Rwandan phone number, credential = 6-digit PIN
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login — email+password (admin) or phone+PIN (others)' })
  @ApiOkResponse({ description: 'Returns accessToken, refreshToken and user profile' })
  async login(@Body() dto: LoginDto) {
    const { user, tokens } = await this.authService.login(dto);
    return this.responseService.response({
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Login successful',
      data: {
        user: {
          ...user,
          password: undefined, // Exclude password from response
        },
        tokens,
      },
    });
  }

  /**
   * Refresh — send the refresh token in Authorization: Bearer <refreshToken>
   * Returns a new access + refresh token pair (rotation).
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RefreshGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Rotate tokens using a valid refresh token' })
  @ApiOkResponse({ description: 'Returns new accessToken and refreshToken' })
  async refresh(
    @CurrentUser() user: authenticateMiddleware.AuthUserType,
    @CurrentRefreshToken() rawRefreshToken: string,
  ) {
    const tokens = await this.authService.refreshTokens(user.sub, rawRefreshToken);
    return this.responseService.response({
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Tokens refreshed',
      data: tokens,
    });
  }

  /**
   * Current authenticated user profile
   */
  @Get('me')
  @Auth()
  @ApiOperation({ summary: 'Get the currently authenticated user' })
  async me(@CurrentUser() user: authenticateMiddleware.AuthUserType) {
    const profile = await this.authService.getMe(user.sub);
    return this.responseService.response({
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Profile retrieved',
      data: profile,
    });
  }

  /**
   * Logout — clears the stored refresh token so it cannot be reused
   */
  @Post('logout')
  @Auth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout and invalidate refresh token' })
  async logout(@CurrentUser() user: authenticateMiddleware.AuthUserType) {
    await this.authService.logout(user.sub);
    return this.responseService.response({
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Logged out successfully',
    });
  }

  /**
   * Request email verification (admin role only).
   * Returns a signed token — in production this would be sent via email.
   */
  @Post('send-verification')
  @Auth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate an email-verification token (admin only)' })
  async sendVerification(@CurrentUser() user: authenticateMiddleware.AuthUserType) {
    const result = await this.authService.sendEmailVerification(user.sub);
    return this.responseService.response({
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Verification token generated. In production this is sent via email.',
      data: result,
    });
  }

  /**
   * Verify admin email address using the token from send-verification
   */
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify admin email with the token from send-verification' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    await this.authService.verifyEmail(dto.token);
    return this.responseService.response({
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Email verified successfully',
    });
  }

  /**
   * Resend verification email  to email
   */
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend verification email to a specific email address' })
  async resendVerificationEmail(@Body() dto: AuthResendVerificationEmailDto) {
    await this.authService.resendVerificationEmail(dto.email);
    return this.responseService.response({
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Verification email resent if the email exists in our system.',
    });
  }
}
