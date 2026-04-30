import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { AuthGuard } from '@/common/guards/auth.guard';
import { RefreshGuard } from '@/common/guards/refresh.guard';
import { AuthenticateMiddleware } from '@/common/middlewares/authenticate.middleware';
import { AppConfig } from '@/config';

@Global()
@Module({
  imports: [
    UsersModule,
    JwtModule.register({
      secret: AppConfig().jwtSecret,
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthenticateMiddleware, AuthGuard, RefreshGuard],
  exports: [AuthService, AuthenticateMiddleware, AuthGuard, RefreshGuard, JwtModule],
})
export class AuthModule {}
