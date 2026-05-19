import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SendSmsOptions {
  to: string;
  body: string;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly configService: ConfigService) {}

  async send(options: SendSmsOptions): Promise<void> {
    const enabled = this.configService.get<boolean>('sms.enabled', false);
    const provider = this.configService.get<'twilio' | 'mock'>('sms.provider', 'twilio');

    if (!enabled) {
      this.logger.log(`SMS disabled. Skipping SMS to ${options.to}`);
      return;
    }

    if (provider === 'mock') {
      this.logger.log(`Mock SMS to ${options.to}: ${options.body}`);
      return;
    }

    await this.sendWithTwilio(options);
  }

  async sendMemberPin(to: string, pin: string, groupName?: string): Promise<void> {
    const mobileAppUrl = this.configService.get<string>(
      'sms.mobileAppUrl',
      'http://localhost:3000',
    );
    const body = [
      'Ibibina System',
      groupName ? `Welcome to ${groupName}.` : 'Your account is ready.',
      `Use phone ${to} and PIN ${pin} to log in on mobile.`,
      `Open app: ${mobileAppUrl}`,
    ].join(' ');

    await this.send({ to, body });
  }

  async sendPinChanged(to: string, pin: string): Promise<void> {
    const mobileAppUrl = this.configService.get<string>(
      'sms.mobileAppUrl',
      'http://localhost:3000',
    );
    const body = `Ibibina System: your PIN was updated. New PIN: ${pin}. Use your phone number to log in on mobile. Open app: ${mobileAppUrl}`;
    await this.send({ to, body });
  }

  private async sendWithTwilio(options: SendSmsOptions): Promise<void> {
    const accountSid = this.configService.get<string>('sms.accountSid', '');
    const authToken = this.configService.get<string>('sms.authToken', '');
    const fromNumber = this.configService.get<string>('sms.fromNumber', '');

    if (!accountSid || !authToken || !fromNumber) {
      this.logger.warn('SMS is enabled but Twilio credentials are incomplete. Skipping SMS send.');
      return;
    }

    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: options.to,
          From: fromNumber,
          Body: options.body,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`Failed to send SMS to ${options.to}: ${errorText}`);
      throw new Error(`Twilio SMS failed with status ${response.status}`);
    }
  }
}
