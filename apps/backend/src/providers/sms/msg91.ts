/**
 * MSG91 SMS provider.
 *
 * Docs: https://docs.msg91.com/p/tf9GTextN/e/8oj6bevvTw/MSG91
 * Endpoint: POST https://control.msg91.com/api/v5/otp
 * Headers: authkey: <key>
 *
 * NOTE: Skeleton — fill in once we have an MSG91 account.
 */

import { loadConfig } from '../../config';
import type { SmsProvider } from './types';

export class Msg91SmsProvider implements SmsProvider {
  readonly name = 'msg91' as const;

  get isConfigured(): boolean {
    const c = loadConfig();
    return Boolean(c.MSG91_AUTH_KEY && c.MSG91_TEMPLATE_ID);
  }

  async sendOtp(phone: string, code: string): Promise<void> {
    const c = loadConfig();
    if (!c.MSG91_AUTH_KEY || !c.MSG91_TEMPLATE_ID) {
      throw new Error('MSG91 not configured');
    }
    const res = await fetch('https://control.msg91.com/api/v5/otp', {
      method: 'POST',
      headers: {
        authkey: c.MSG91_AUTH_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        template_id: c.MSG91_TEMPLATE_ID,
        mobile: phone.replace(/\D/g, ''),
        otp: code,
        sender: c.MSG91_SENDER_ID,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`MSG91 ${res.status}: ${text.slice(0, 200)}`);
    }
  }
}
