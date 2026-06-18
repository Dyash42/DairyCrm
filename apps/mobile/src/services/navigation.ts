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

export interface NavResult {
  /** false = nothing to navigate to (no pin AND no usable address label). */
  ok: boolean;
  /** true = navigated to an approximate address, not an exact door pin (MIL-08). */
  approximate: boolean;
}

export interface NavigationProvider {
  readonly name: string;
  navigateTo(dest: NavDestination): Promise<NavResult>;
}

class DeviceMapsNavigationProvider implements NavigationProvider {
  readonly name = 'device-maps';

  async navigateTo({ lat, lng, label }: NavDestination): Promise<NavResult> {
    const hasCoords = typeof lat === 'number' && typeof lng === 'number';
    const cleanLabel = (label ?? '').trim();
    // MIL-08: don't open maps with an empty destination — for an un-pinned stop
    // with no address we report ok:false so the UI can tell the agent why.
    if (!hasCoords && !cleanLabel) {
      return { ok: false, approximate: true };
    }
    const dest = hasCoords ? `${lat},${lng}` : encodeURIComponent(cleanLabel);
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
        return { ok: true, approximate: false };
      }
    } catch {
      // fall through to the universal web URL
    }
    await Linking.openURL(webUrl);
    return { ok: true, approximate: !hasCoords };
  }
}

let cached: NavigationProvider | null = null;

export function getNavigationProvider(): NavigationProvider {
  if (!cached) cached = new DeviceMapsNavigationProvider();
  return cached;
}
