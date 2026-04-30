import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

export interface SendEmailVerificationOptions {
  to: string;
  name: string;
  verificationUrl: string;
}

export interface SendWelcomeOptions {
  to: string;
  name: string;
  role: string;
  /** Email for admins, phone for others */
  identifier: string;
  /** Plaintext password or PIN — send only right after creation */
  credential: string;
  /** 'password' | 'PIN' */
  credentialLabel: string;
  loginUrl: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly mailerService: MailerService) {}

  async sendEmailVerification(options: SendEmailVerificationOptions): Promise<void> {
    const { to, name, verificationUrl } = options;
    try {
      await this.mailerService.sendMail({
        to,
        subject: 'Verify your email address — Ibibina System',
        template: 'email-verification',
        context: {
          name,
          verificationUrl,
          year: new Date().getFullYear(),
        },
      });
    } catch (err) {
      this.logger.error(`Failed to send verification email to ${to}`, err);
      throw err;
    }
  }

  async sendWelcome(options: SendWelcomeOptions): Promise<void> {
    const { to, name, role, identifier, credential, credentialLabel, loginUrl } = options;
    try {
      await this.mailerService.sendMail({
        to,
        subject: 'Welcome to Ibibina System — Your account is ready',
        template: 'welcome',
        context: {
          name,
          role,
          identifier,
          credential,
          credentialLabel,
          loginUrl,
          year: new Date().getFullYear(),
        },
      });
    } catch (err) {
      this.logger.error(`Failed to send welcome email to ${to}`, err);
      throw err;
    }
  }
}
