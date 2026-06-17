/**
 * Map abstraction — the seam that makes the map provider swappable.
 * Implement this interface for a new provider (Google, Mapbox…) and select
 * it in ./index.ts; no page code changes. DRY: all provider-specific code
 * lives behind this contract.
 */
export interface LatLng {
  lat: number;
  lng: number;
}

export interface MapHandle {
  /** Current draggable-pin position. */
  getMarker(): LatLng;
  /** Recenter the map + move the pin (used by "use my location"). */
  setView(center: LatLng, zoom?: number): void;
  /** Tear down the map instance. */
  destroy(): void;
}

export interface MapMountOptions {
  container: HTMLElement;
  center: LatLng;
  zoom?: number;
  /** Called whenever the user drags the pin or taps a new spot. */
  onMarkerMove?: (c: LatLng) => void;
}

export interface MapAdapter {
  readonly name: string;
  mount(opts: MapMountOptions): Promise<MapHandle>;
}
