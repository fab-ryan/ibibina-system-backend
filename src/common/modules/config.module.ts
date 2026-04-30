import { AppConfig } from '@/config';
import { MailConfig } from '@/config/mail';
import { Module } from '@nestjs/common';
import { ConfigModule as ConfigAppModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigAppModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.development.local', '.env.development', '.env'],
      load: [AppConfig, MailConfig],
    }),
  ],
})
export class ConfigModule {}
