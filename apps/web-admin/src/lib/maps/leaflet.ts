/**
 * Leaflet + OpenStreetMap implementation of MapAdapter. Free, no API key,
 * self-hosted (tiles from OSM). This module is dynamically imported (see
 * ./index.ts) so Leaflet's `window` usage never runs during SSR/build, and
 * all Leaflet specifics — including its CSS — stay contained here.
 */
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import type { MapAdapter, MapHandle, MapMountOptions } from './types';

export class LeafletMapAdapter implements MapAdapter {
  readonly name = 'leaflet-osm';

  async mount({ container, center, zoom = 16, onMarkerMove }: MapMountOptions): Promise<MapHandle> {
    const map = L.map(container).setView([center.lat, center.lng], zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    // Custom HTML pin so we don't depend on Leaflet's image marker assets
    // (which break under bundlers without extra config).
    const icon = L.divIcon({
      className: 'jh-map-pin',
      html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#1F4E78;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>',
      iconSize: [22, 22],
      iconAnchor: [11, 22],
    });
    const marker = L.marker([center.lat, center.lng], { draggable: true, icon }).addTo(map);

    const emit = () => {
      const p = marker.getLatLng();
      onMarkerMove?.({ lat: p.lat, lng: p.lng });
    };
    marker.on('dragend', emit);
    map.on('click', (e: L.LeafletMouseEvent) => {
      marker.setLatLng(e.latlng);
      emit();
    });

    return {
      getMarker() {
        const p = marker.getLatLng();
        return { lat: p.lat, lng: p.lng };
      },
      setView(c, z) {
        map.setView([c.lat, c.lng], z ?? zoom);
        marker.setLatLng([c.lat, c.lng]);
        onMarkerMove?.(c);
      },
      destroy() {
        map.remove();
      },
    };
  }
}
