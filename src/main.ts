import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as path from 'path';
import { AppModule } from './app.module';
import { SwaggerConfig, AppConfig, winstonLoggerConfig } from './config';
import { I18nMiddleware, I18nValidationPipe } from 'nestjs-i18n';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { WinstonModule, WinstonModuleOptions } from 'nest-winston';
import { AllExceptionsFilter, HttpExceptionFilter } from './core';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { requestContextMiddleware } from './common/middlewares';
import { NextFunction, Request, Response } from 'express';

async function bootstrap() {
  const appConfig = AppConfig();
  const loggerOptions: WinstonModuleOptions = winstonLoggerConfig(appConfig.logLevel);
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: WinstonModule.createLogger(loggerOptions),
  });
  // Serve generated Excel reports as static files at /reports/files/<filename>
  app.useStaticAssets(path.resolve(process.cwd(), 'public'), { prefix: '/' });
  app.useGlobalInterceptors(new LoggingInterceptor());
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  app.use(requestContextMiddleware);
  app.use(I18nMiddleware);
  app.setGlobalPrefix(appConfig.prefix);
  app.enableCors({
    origin: true,
    credentials: true,
    allowedHeaders: '*',
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
    res.header(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, Authorization',
    );

    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }

    next();
  });
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
