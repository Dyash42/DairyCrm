import type { MapAdapter } from './types';

export type { MapAdapter, MapHandle, LatLng, MapMountOptions } from './types';

/**
 * Returns the active map adapter.
 *
 * SWAP POINT: to move to Google Maps (or Mapbox), add `./google.ts` exporting
 * a `GoogleMapAdapter implements MapAdapter`, add a `case 'google'` below, and
 * set `NEXT_PUBLIC_MAP_PROVIDER=google`. No page/component code changes.
 *
 * Adapters are dynamically imported so a heavy map lib never runs during
 * SSR/build (Leaflet touches `window` at import time).
 */
export async function getMapAdapter(): Promise<MapAdapter> {
  const provider = process.env.NEXT_PUBLIC_MAP_PROVIDER ?? 'leaflet';
  switch (provider) {
    // case 'google': {
    //   const m = await import('./google');
    //   return new m.GoogleMapAdapter();
    // }
    default: {
      const m = await import('./leaflet');
      return new m.LeafletMapAdapter();
    }
  }
}
