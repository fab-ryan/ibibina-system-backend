import { registerAs } from '@nestjs/config';

interface PaymentConfigInterface {
  paypackApiKey: NonNullable<string>;
  paypackApiSecret: NonNullable<string>;
  paypackApiUrl: NonNullable<string>;
}

export const PaymentConfig = registerAs(
  'payment',
  (): PaymentConfigInterface => ({
    paypackApiKey: process.env.PAYPACK_API_KEY || '',
    paypackApiSecret: process.env.PAYPACK_API_SECRET || '',
    paypackApiUrl: process.env.PAYPACK_API_URL || 'https://payments.paypack.rw/api/',
  }),
);
