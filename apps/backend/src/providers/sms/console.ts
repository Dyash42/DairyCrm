/**
 * Console "SMS" provider — for dev / CI / no-creds scenarios.
 * Prints the OTP to stdout so the test executive can read it from the server log.
 */

import type { SmsProvider } from './types';

export class ConsoleSmsProvider implements SmsProvider {
  readonly name = 'console' as const;
  readonly isConfigured = true;

  async sendOtp(phone: string, code: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[sms:console] OTP for ${phone}: ${code}`);
  }
}
