import { registerAs } from '@nestjs/config';
interface AppConfigInterface {
  port: NonNullable<number>;
  jwtSecret: NonNullable<string>;
  jwtExpiresIn: NonNullable<string>;
  refreshSecret: NonNullable<string>;
  refreshExpiresIn: NonNullable<string>;
  logLevel: NonNullable<'debug' | 'info' | 'warn' | 'error'>;
  enableCaching: NonNullable<boolean>;
  prefix: NonNullable<string>;
}

export const AppConfig = registerAs(
  'app',
  (): AppConfigInterface => ({
    port: parseInt(process.env.PORT || '5100', 10),
    jwtSecret: process.env.JWT_SECRET || 'defaultSecret',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshSecret: process.env.REFRESH_TOKEN_SECRET || 'defaultRefreshSecret',
    refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
    logLevel: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
    enableCaching: process.env.ENABLE_CACHING === 'true',
    prefix: process.env.PREFIX || 'api/v1',
  }),
);
