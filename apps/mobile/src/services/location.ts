/**
 * Current-position capture, behind a swappable provider interface.
 *
 * Native uses expo-location (lazy-imported so it never loads on web). Web
 * uses the browser's Geolocation API. The delivery app uses this to pin a
 * customer's door on the first delivery when no pin exists yet.
 */
import { Platform } from 'react-native';

export interface Coords {
  lat: number;
  lng: number;
}

export interface LocationProvider {
  readonly name: string;
  getCurrentPosition(): Promise<Coords | null>;
}

class ExpoLocationProvider implements LocationProvider {
  readonly name = 'expo-location';

  async getCurrentPosition(): Promise<Coords | null> {
    const Location = await import('expo-location');
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  }
}

class WebGeolocationProvider implements LocationProvider {
  readonly name = 'web-geolocation';

  async getCurrentPosition(): Promise<Coords | null> {
    const geo = (
      globalThis as {
        navigator?: {
          geolocation?: {
            getCurrentPosition(
              success: (p: { coords: { latitude: number; longitude: number } }) => void,
              error: () => void,
              opts?: object,
            ): void;
          };
        };
      }
    ).navigator?.geolocation;
    if (!geo) return null;
    return new Promise<Coords | null>((resolve) => {
      geo.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10_000 },
      );
    });
  }
}

let cached: LocationProvider | null = null;

export function getLocationProvider(): LocationProvider {
  if (!cached) {
    cached =
      Platform.OS === 'web'
        ? new WebGeolocationProvider()
        : new ExpoLocationProvider();
  }
  return cached;
}
