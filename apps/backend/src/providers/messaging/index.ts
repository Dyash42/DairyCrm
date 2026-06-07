/**
 * Messaging provider factory — picks Meta when configured, else stub.
 */

import { loadConfig } from '../../config';
import { MetaMessagingProvider } from './meta';
import { StubMessagingProvider } from './stub';
import type { MessagingProvider, MessagingProviderName } from './types';

export * from './types';

let cached: MessagingProvider | null = null;

export function getMessagingProvider(): MessagingProvider {
  if (cached) return cached;
  const explicit = loadConfig().MESSAGING_PROVIDER as MessagingProviderName | undefined;
  if (explicit === 'meta') return (cached = new MetaMessagingProvider());
  if (explicit === 'stub') return (cached = new StubMessagingProvider());

  const meta = new MetaMessagingProvider();
  if (meta.isConfigured) return (cached = meta);
  return (cached = new StubMessagingProvider());
}

export function _resetMessagingProviderForTests(): void {
  cached = null;
}
