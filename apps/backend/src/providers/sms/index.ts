import { loadConfig } from '../../config';
import { ConsoleSmsProvider } from './console';
import { Msg91SmsProvider } from './msg91';
import { TwilioSmsProvider } from './twilio';
import type { SmsProvider } from './types';

export * from './types';

let cached: SmsProvider | null = null;

export function getSmsProvider(): SmsProvider {
  if (cached) return cached;
  const choice = loadConfig().SMS_PROVIDER;
  // Fail LOUD when an operator explicitly selects a real provider but its
  // credentials are missing/typo'd. Previously this silently fell back to the
  // console provider, so OTP "sends" succeeded to stdout while the field team
  // never received an SMS and could not log in — a silent total outage (PRO-04).
  if (choice === 'msg91') {
    const p = new Msg91SmsProvider();
    if (!p.isConfigured) {
      throw new Error(
        'SMS_PROVIDER=msg91 but MSG91 credentials are missing (MSG91_AUTH_KEY/MSG91_TEMPLATE_ID/MSG91_SENDER_ID). ' +
          'Refusing to silently fall back to the console provider — fix the creds or set SMS_PROVIDER=console.',
      );
    }
    return (cached = p);
  }
  if (choice === 'twilio') {
    const p = new TwilioSmsProvider();
    if (!p.isConfigured) {
      throw new Error(
        'SMS_PROVIDER=twilio but Twilio credentials are missing (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM). ' +
          'Refusing to silently fall back to the console provider — fix the creds or set SMS_PROVIDER=console.',
      );
    }
    return (cached = p);
  }
  return (cached = new ConsoleSmsProvider());
}

export function _resetSmsProviderForTests(): void {
  cached = null;
}
