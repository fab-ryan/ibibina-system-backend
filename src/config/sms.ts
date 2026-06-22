import { registerAs } from '@nestjs/config';

export interface SmsConfigInterface {
  enabled: boolean;
  provider: 'pindo' | 'mock';
  pindoToken: string;
  pindoSender: string;
  mobileAppUrl: string;
}

export const SmsConfig = registerAs(
  'sms',
  (): SmsConfigInterface => ({
    enabled: process.env.SMS_ENABLED === 'true',
    provider: (process.env.SMS_PROVIDER as 'pindo' | 'mock') || 'pindo',
    pindoToken: process.env.PINDO_TOKEN || '',
    pindoSender: process.env.PINDO_SENDER || 'Ibibina',
    mobileAppUrl: process.env.MOBILE_APP_URL || process.env.APP_URL || 'http://localhost:3000',
  }),
);
