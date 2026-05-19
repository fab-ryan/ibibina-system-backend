import { registerAs } from '@nestjs/config';

export interface SmsConfigInterface {
  enabled: boolean;
  provider: 'twilio' | 'mock';
  accountSid: string;
  authToken: string;
  fromNumber: string;
  mobileAppUrl: string;
}

export const SmsConfig = registerAs(
  'sms',
  (): SmsConfigInterface => ({
    enabled: process.env.SMS_ENABLED === 'true',
    provider: (process.env.SMS_PROVIDER as 'twilio' | 'mock') || 'twilio',
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    fromNumber: process.env.TWILIO_FROM_NUMBER || '',
    mobileAppUrl: process.env.MOBILE_APP_URL || process.env.APP_URL || 'http://localhost:3000',
  }),
);
