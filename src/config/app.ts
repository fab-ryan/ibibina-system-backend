interface AppConfigInterface {
  port: NonNullable<number>;
  jwtSecret: NonNullable<string>;
  logLevel: NonNullable<'debug' | 'info' | 'warn' | 'error'>;
  enableCaching: NonNullable<boolean>;
  prefix: NonNullable<string>;
}

export const AppConfig = (): AppConfigInterface => ({
  port: parseInt(process.env.PORT || '5500', 10),
  jwtSecret: process.env.JWT_SECRET || 'defaultSecret',
  logLevel:
    (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
  enableCaching: process.env.ENABLE_CACHING === 'true',
  prefix: process.env.PREFIX || 'api/v1',
});
