export type SmsProviderName = 'console' | 'msg91' | 'twilio';

export interface SmsProvider {
  readonly name: SmsProviderName;
  readonly isConfigured: boolean;
  /** Send an OTP. Throws on failure. */
  sendOtp(phone: string, code: string): Promise<void>;
}
