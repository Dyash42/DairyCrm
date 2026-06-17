/**
 * Turn-by-turn navigation, behind a swappable provider interface.
 *
 * Default: hand off to the device's maps app (Google Maps / Apple Maps) for
 * real live turn-by-turn — the same model ride/delivery apps use. To switch
 * to an in-app navigation SDK (e.g. Mapbox/Google) later, add a provider
 * class and select it in getNavigationProvider() — NO call sites change.
 */
import { Linking, Platform } from 'react-native';

export interface NavDestination {
  lat?: number | null;
  lng?: number | null;
  /** Human label / address — used as the destination when there's no pin. */
  label?: string;
}

export interface NavigationProvider {
  readonly name: string;
  navigateTo(dest: NavDestination): Promise<void>;
}

class DeviceMapsNavigationProvider implements NavigationProvider {
  readonly name = 'device-maps';

  async navigateTo({ lat, lng, label }: NavDestination): Promise<void> {
    const hasCoords = typeof lat === 'number' && typeof lng === 'number';
    const dest = hasCoords ? `${lat},${lng}` : encodeURIComponent(label ?? '');
    const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
    const nativeUrl = hasCoords
      ? Platform.select({
          ios: `maps://?daddr=${lat},${lng}`,
          android: `google.navigation:q=${lat},${lng}`,
          default: '',
        })
      : '';

    try {
      if (nativeUrl && (await Linking.canOpenURL(nativeUrl))) {
        await Linking.openURL(nativeUrl);
        return;
      }
    } catch {
      // fall through to the universal web URL
    }
    await Linking.openURL(webUrl);
  }
}

let cached: NavigationProvider | null = null;

export function getNavigationProvider(): NavigationProvider {
  if (!cached) cached = new DeviceMapsNavigationProvider();
  return cached;
}
