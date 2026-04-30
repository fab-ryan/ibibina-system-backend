import { registerAs } from '@nestjs/config';

export interface MailConfigInterface {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
  fromName: string;
}

export const MailConfig = registerAs(
  'mail',
  (): MailConfigInterface => ({
    host: process.env.MAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.MAIL_PORT || '587', 10),
    secure: process.env.MAIL_SECURE === 'true',
    user: process.env.MAIL_USER || '',
    password: process.env.MAIL_PASSWORD || '',
    from: process.env.MAIL_FROM || 'noreply@ibibina.rw',
    fromName: process.env.MAIL_FROM_NAME || 'Ibibina System',
  }),
);
