import { Injectable } from '@nestjs/common';
import { LoggerService } from './logger.service';
import { BadRequestException } from '@/core';
interface AuthorizePaymentResult {
  access: string;
  refresh: string;
  expires: string;
}

interface InitiatePaymentResult {
  amount: number;
  created_at: string;
  kind: 'CASHIN';
  ref: string;
  status: string;
}

@Injectable()
export class PaymentService {
  constructor(private readonly logger: LoggerService) { }
  async initiatePayment(pay: { paidAmount: number; phoneNumber: string }) {
    try {
      const auth = await this.authorizePayment();
      this.logger.info('Payment authorized, access token:', auth.access);

      const paymentResponse = await fetch(`${process.env.PAYPACK_API_URL}transactions/cashin`, {
        method: 'POST',
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${auth.access}`,
          "X-Webhook-Mode": "development"
        },
        body: JSON.stringify({
          amount: pay.paidAmount,
          number: pay.phoneNumber,
        }),
      });
      const res = await paymentResponse.json();
      this.logger.info('Payment initiation response:', JSON.stringify(res));
      if (!paymentResponse.ok) {
        throw new BadRequestException(`${JSON.stringify(res)}`);
      }
      return res;
    } catch (error) {
      const errorMessage =
        (error instanceof Error ? error.message : String(error));
      this.logger.error(errorMessage);
      throw new Error(errorMessage);

    }
  }

  async authorizePayment(): Promise<AuthorizePaymentResult> {
    try {
      // Call Paypack API to get access token
      const response = await fetch(`${process.env.PAYPACK_API_URL}auth/agents/authorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: process.env.PAYPACK_API_KEY,
          client_secret: process.env.PAYPACK_API_SECRET,
        }),
      });
      if (!response.ok) {
        throw new Error(`Paypack auth failed: ${response.statusText}`);
      }
      const data: AuthorizePaymentResult = await response.json();
      return data;
    } catch (error) {
      console.error('Error authorizing payment:', error);
      throw error;
    }
  }
}
