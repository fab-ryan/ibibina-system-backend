import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SendSmsOptions {
  to: string;
  body: string;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly configService: ConfigService) { }

  async send(options: SendSmsOptions): Promise<void> {
    const enabled = this.configService.get<boolean>('sms.enabled', true);
    const provider = this.configService.get<'pindo' | 'mock'>('sms.provider', 'pindo');

    if (!enabled) {
      this.logger.log(`SMS disabled. Skipping SMS to ${options.to}`);
      return;
    }

    if (provider === 'mock') {
      this.logger.log(`Mock SMS to ${options.to}: ${options.body}`);
      return;
    }

    await this.sendWithPindo(options);
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

  async sendPasswordResetOtp(to: string, otp: string): Promise<void> {
    const body = `Ibibina System: Your password reset verification code is ${otp}. It will expire in 15 minutes.`;
    await this.send({ to, body });
  }

  private async sendWithPindo(options: SendSmsOptions): Promise<void> {
    const token = this.configService.get<string>('sms.pindoToken', '');
    const sender = this.configService.get<string>('sms.pindoSender', 'PindoTest');
    if (!token) {
      this.logger.warn('SMS is enabled but Pindo token is missing. Skipping SMS send.');
      return;
    }

    const response = await fetch('https://api.pindo.io/v1/sms/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: options.to,
        text: options.body,
        sender,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`Failed to send SMS to ${options.to}: ${errorText}`);
      throw new Error(`Pindo SMS failed with status ${response.status}`);
    }
  }
}
