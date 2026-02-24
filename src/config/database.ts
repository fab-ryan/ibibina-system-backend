interface DatabaseConfigInterface {
  host: NonNullable<string>;
  port: NonNullable<number>;
  username: NonNullable<string>;
  password: NonNullable<string>;
  database: NonNullable<string>;
  synchronize: NonNullable<boolean>;
  logging: NonNullable<boolean>;
}

export const DatabaseConfig = (): DatabaseConfigInterface => ({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'user',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_DATABASE || 'app_db',
  synchronize: process.env.DB_SYNCHRONIZE === 'true',
  logging: process.env.DB_LOGGING === 'true',
});
