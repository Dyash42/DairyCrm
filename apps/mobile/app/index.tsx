import { Redirect } from 'expo-router';

import { Splash } from '@/components/Splash';
import { useAuthStore } from '@/state/authStore';

/** Entry route. Shows the splash until auth bootstrap resolves, then sends
 *  the user to the authed stack or to login. */
export default function Index() {
  const status = useAuthStore((s) => s.status);

  if (status === 'unknown') {
    return <Splash />;
  }
  const href =
    status === 'signedIn'
      ? '/route'
      : status === 'needsPin'
        ? '/enter-pin'
        : status === 'needsPinSetup'
          ? '/create-pin'
          : '/login';
  return <Redirect href={href} />;
}
