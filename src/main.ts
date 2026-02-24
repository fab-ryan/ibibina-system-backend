import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerConfig, AppConfig } from './config';
import { I18nMiddleware, I18nValidationPipe } from 'nestjs-i18n';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(I18nMiddleware);
  app.setGlobalPrefix(AppConfig().prefix);
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
  await app.listen(AppConfig().port);
}
bootstrap();
