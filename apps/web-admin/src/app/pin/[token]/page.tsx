'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { API_BASE } from '@/lib/api';
import { getMapAdapter, type LatLng, type MapHandle } from '@/lib/maps';

/** Default map center when the customer has no pin yet (Berhampur, Odisha). */
const DEFAULT_CENTER: LatLng = { lat: 19.3149, lng: 84.7941 };

interface PinContext {
  customerName: string;
  area: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  used: boolean;
}

type Status = 'loading' | 'ready' | 'saving' | 'saved' | 'error';

export default function PinPage({ params }: { params: { token: string } }) {
  const { token } = params;
  const mapRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<MapHandle | null>(null);

  const [ctx, setCtx] = useState<PinContext | null>(null);
  const [marker, setMarker] = useState<LatLng>(DEFAULT_CENTER);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);

  // 1) Load the token context.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/location/${encodeURIComponent(token)}`);
        if (!res.ok) {
          setError(
            res.status === 410
              ? 'This link has expired. Please ask Jharanai for a new one.'
              : res.status === 404
                ? 'This link is invalid.'
                : 'Could not load this link.',
          );
          setStatus('error');
          return;
        }
        const data = (await res.json()) as PinContext;
        if (cancelled) return;
        setCtx(data);
        if (data.lat != null && data.lng != null) setMarker({ lat: data.lat, lng: data.lng });
        setStatus('ready');
      } catch {
        if (!cancelled) {
          setError('Could not reach the server.');
          setStatus('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // 2) Mount the map once we're ready.
  useEffect(() => {
    if (status !== 'ready' || !mapRef.current || handleRef.current) return;
    let destroyed = false;
    (async () => {
      const adapter = await getMapAdapter();
      if (destroyed || !mapRef.current) return;
      const center =
        ctx?.lat != null && ctx?.lng != null ? { lat: ctx.lat, lng: ctx.lng } : DEFAULT_CENTER;
      handleRef.current = await adapter.mount({
        container: mapRef.current,
        center,
        zoom: 16,
        onMarkerMove: setMarker,
      });
    })();
    return () => {
      destroyed = true;
      handleRef.current?.destroy();
      handleRef.current = null;
    };
  }, [status, ctx]);

  const useMyLocation = useCallback(() => {
    const geo =
      typeof navigator !== 'undefined' ? navigator.geolocation : undefined;
    if (!geo) return;
    geo.getCurrentPosition(
      (p) => {
        const c = { lat: p.coords.latitude, lng: p.coords.longitude };
        handleRef.current?.setView(c, 17);
        setMarker(c);
      },
      () => setError('Could not get your location. Drag the pin to your home instead.'),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, []);

  const save = useCallback(async () => {
    setStatus('saving');
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/location/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: marker.lat, lng: marker.lng }),
      });
      if (!res.ok) {
        setError(
          res.status === 409
            ? 'Your location was already saved.'
            : res.status === 410
              ? 'This link has expired.'
              : 'Could not save. Please try again.',
        );
        setStatus('error');
        return;
      }
      setStatus('saved');
    } catch {
      setError('Could not reach the server.');
      setStatus('error');
    }
  }, [marker, token]);

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center">
      <div className="w-full max-w-md px-5 py-6 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-brand flex items-center justify-center text-white text-lg">
            💧
          </div>
          <div>
            <div className="font-bold text-text-primary leading-tight">Jharanai</div>
            <div className="text-xs text-text-secondary">Set your delivery location</div>
          </div>
        </div>

        {status === 'loading' && <p className="text-text-secondary text-sm">Loading…</p>}

        {status === 'error' && error && (
          <div className="bg-danger-light text-danger-dark text-sm rounded-lg p-3">{error}</div>
        )}

        {status === 'saved' && (
          <div className="bg-success-light text-success-dark text-sm rounded-lg p-4 text-center">
            ✅ Thank you! Your home location is saved. Our delivery partner will find your door.
          </div>
        )}

        {(status === 'ready' || status === 'saving') && (
          <>
            <p className="text-sm text-text-secondary">
              {ctx?.customerName ? `Hi ${ctx.customerName.split(' ')[0]} — ` : ''}
              drag the pin to your exact home, or tap “Use my current location”. Then save.
            </p>
            {ctx?.address && (
              <p className="text-xs text-text-muted">📍 {ctx.address}{ctx.area ? `, ${ctx.area}` : ''}</p>
            )}

            <div
              ref={mapRef}
              style={{ height: '58vh', width: '100%' }}
              className="rounded-xl overflow-hidden border border-border"
            />

            <button onClick={useMyLocation} className="btn-secondary w-full justify-center">
              📡 Use my current location
            </button>
            <button
              onClick={save}
              disabled={status === 'saving'}
              className="btn-primary w-full justify-center disabled:opacity-50"
            >
              {status === 'saving' ? 'Saving…' : 'Save my home location'}
            </button>
            <p className="text-[11px] text-text-muted text-center">
              Pin: {marker.lat.toFixed(5)}, {marker.lng.toFixed(5)}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
