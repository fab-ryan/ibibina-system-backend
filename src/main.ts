import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerConfig, AppConfig, winstonLoggerConfig } from './config';
import { I18nMiddleware, I18nValidationPipe } from 'nestjs-i18n';
import { ValidationPipe } from '@nestjs/common';
import { WinstonModule, WinstonModuleOptions } from 'nest-winston';
import { AllExceptionsFilter, HttpExceptionFilter } from './core';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { requestContextMiddleware } from './common/middlewares';

async function bootstrap() {
  const appConfig = AppConfig();
  const loggerOptions: WinstonModuleOptions = winstonLoggerConfig(appConfig.logLevel);
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger(loggerOptions),
  });
  app.useGlobalInterceptors(new LoggingInterceptor());
  app.use(requestContextMiddleware);
  app.use(I18nMiddleware);
  app.setGlobalPrefix(appConfig.prefix);
  app.enableCors();
  app.useGlobalPipes(
    new I18nValidationPipe(),
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  SwaggerConfig.documentBuilder(app);
  app.useGlobalFilters(new AllExceptionsFilter(), new HttpExceptionFilter());
  app.enableShutdownHooks();
  await app.listen(appConfig.port);
}
void bootstrap();
