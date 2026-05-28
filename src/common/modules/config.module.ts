import { AppConfig } from '@/config';
import { MailConfig } from '@/config/mail';
import { PaymentConfig } from '@/config/payment';
import { SmsConfig } from '@/config/sms';
import { Module } from '@nestjs/common';
import { ConfigModule as ConfigAppModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigAppModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.development.local', '.env.development', '.env'],
      load: [AppConfig, MailConfig, SmsConfig, PaymentConfig],
    }),
  ],
})
export class ConfigModule {}
