import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength, MaxLength } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({
    description: 'Email verification token received via the send-verification endpoint',
  })
  @IsNotEmpty()
  @IsString()
  token!: string;
}

export class TokenPairDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;
}

export class AuthResendVerificationEmailDto {
  @ApiProperty({
    description: 'Email address to resend the verification email to',
    example: 'example@example.com',
  })
  @IsNotEmpty()
  @IsString()
  email!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({
    description: 'User email or Rwandan phone number',
    example: 'example@example.com',
  })
  @IsNotEmpty()
  @IsString()
  identifier!: string;
}

export class VerifyResetOtpDto {
  @ApiProperty({
    description: 'User email or Rwandan phone number',
    example: 'example@example.com',
  })
  @IsNotEmpty()
  @IsString()
  identifier!: string;

  @ApiProperty({
    description: '4-digit OTP received via email or SMS',
    example: '1234',
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(4)
  @MaxLength(4)
  otp!: string;
}

export class ResetPasswordDto {
  @ApiProperty({
    description: 'Password reset token obtained from verifying OTP',
  })
  @IsNotEmpty()
  @IsString()
  token!: string;

  @ApiProperty({
    description: 'New password to set',
    example: 'NewSecretPass123!',
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  newPassword!: string;
}
