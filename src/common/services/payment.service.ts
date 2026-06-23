import { Injectable } from '@nestjs/common';
import { LoggerService } from './logger.service';
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
  constructor(private readonly logger: LoggerService) {}
  async initiatePayment(pay: { paidAmount: number; phoneNumber: string }) {
    try {
      const auth = await this.authorizePayment();
      this.logger.info('Payment authorized, access token:', auth.access);

      const paymentResponse = await fetch(`${process.env.PAYPACK_API_URL}transactions/cashin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.access}`,
        },
        body: JSON.stringify({
          amount: pay.paidAmount,
          number: pay.phoneNumber,
        }),
      });
      this.logger.info('Payment initiation response status:', JSON.stringify(paymentResponse));
      if (!paymentResponse.ok) {
        throw new Error(`Paypack payment initiation failed: ${paymentResponse.statusText}`);
      }
      const paymentResult: InitiatePaymentResult = await paymentResponse.json();
      return paymentResult;
    } catch (error) {
      const errorMessage =
        'Failed to initiate payment: ' + (error instanceof Error ? error.message : String(error));
      this.logger.error(errorMessage);
      throw new Error(errorMessage);
      // this.logger.error('Failed to initiate payment:', error);
      // throw error;
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
