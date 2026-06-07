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
  if (choice === 'msg91') {
    const p = new Msg91SmsProvider();
    if (p.isConfigured) return (cached = p);
  }
  if (choice === 'twilio') {
    const p = new TwilioSmsProvider();
    if (p.isConfigured) return (cached = p);
  }
  return (cached = new ConsoleSmsProvider());
}

export function _resetSmsProviderForTests(): void {
  cached = null;
}
