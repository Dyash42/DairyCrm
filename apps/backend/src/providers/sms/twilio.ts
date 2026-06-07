/**
 * Twilio SMS provider.
 *
 * Docs: https://www.twilio.com/docs/sms/send-messages
 * Endpoint: POST https://api.twilio.com/2010-04-01/Accounts/<SID>/Messages.json
 * Auth: Basic base64(SID:AUTH_TOKEN)
 */

import { loadConfig } from '../../config';
import type { SmsProvider } from './types';

export class TwilioSmsProvider implements SmsProvider {
  readonly name = 'twilio' as const;

  get isConfigured(): boolean {
    const c = loadConfig();
    return Boolean(c.TWILIO_ACCOUNT_SID && c.TWILIO_AUTH_TOKEN && c.TWILIO_FROM);
  }

  async sendOtp(phone: string, code: string): Promise<void> {
    const c = loadConfig();
    if (!c.TWILIO_ACCOUNT_SID || !c.TWILIO_AUTH_TOKEN || !c.TWILIO_FROM) {
      throw new Error('Twilio not configured');
    }
    const body = new URLSearchParams({
      From: c.TWILIO_FROM,
      To: phone,
      Body: `Your Jharanai code is ${code}. Do not share with anyone.`,
    });
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${c.TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${c.TWILIO_ACCOUNT_SID}:${c.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Twilio ${res.status}: ${text.slice(0, 200)}`);
    }
  }
}
