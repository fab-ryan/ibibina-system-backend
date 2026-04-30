import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

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
