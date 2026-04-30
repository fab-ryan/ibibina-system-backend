import { Global, Module } from '@nestjs/common';
import { I18nModule, LoggerModule } from './modules';
import { ConfigService } from '@nestjs/config';
import { ConfigModule } from './modules/config.module';
import { LoggerService } from './services/logger.service';
import { ResponseService } from './services/response.service';
import { AuthenticateMiddleware } from './middlewares/authenticate.middleware';

@Global()
@Module({
  imports: [I18nModule, LoggerModule, ConfigModule],
  providers: [
    ConfigService,
    { provide: LoggerService, useClass: LoggerService },
    ResponseService,
    AuthenticateMiddleware,
  ],
  exports: [
    I18nModule,
    LoggerModule,
    ConfigService,
    ConfigModule,
    LoggerService,
    ResponseService,
    AuthenticateMiddleware,
  ],
})
export class CommonModule {}
