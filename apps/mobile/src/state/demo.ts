/**
 * Demo data for the design-preview modes (dev builds only). Port of the
 * Flutter route_provider's _baseStops / _demoSummary. In production the
 * screen always loads live data (demoMode === 'off').
 */
import { DeliveryStop, RouteSummary } from '@/models/delivery';

export type DemoMode = 'off' | 'morning' | 'midRoute' | 'complete';

const EXEC = 'Ramesh Sahu';
const DATE = 'Mon 2 Jun';
const ROUTE = 'Route 4 — Berhampur South';

function baseStops(): DeliveryStop[] {
  return [
    new DeliveryStop({ id: 's1', customerCode: 'JHR-100455', customerName: 'Sunil Pradhan', houseNumber: 'MIG-12', addressLine: 'Gandhi Nagar, 3rd Lane', scheduledLitres: 2.0, sequence: 1 }),
    new DeliveryStop({ id: 's2', customerCode: 'JHR-100390', customerName: 'Anita Sahoo', houseNumber: 'Plot 4', addressLine: 'Sasibhushan Lane, Berhampur', scheduledLitres: 1.0, sequence: 2 }),
    new DeliveryStop({ id: 's3', customerCode: 'JHR-100501', customerName: 'Bijay Patnaik', houseNumber: 'Flat 27', addressLine: 'Surya Vihar, Block C', scheduledLitres: 3.0, sequence: 3 }),
    new DeliveryStop({ id: 's4', customerCode: 'JHR-100214', customerName: 'Lopamudra Das', houseNumber: 'House 8', addressLine: 'Aska Road, near Temple', scheduledLitres: 1.5, sequence: 4 }),
    new DeliveryStop({ id: 's5', customerCode: 'JHR-100377', customerName: 'Rabindra Mohanty', houseNumber: 'MIG-15', addressLine: 'Gajapati Nagar, 2nd Cross', scheduledLitres: 2.0, sequence: 5 }),
  ];
}

export function demoSummary(mode: DemoMode): RouteSummary {
  const stops = baseStops();

  if (mode === 'midRoute') {
    stops[0] = stops[0].copyWith({ status: 'delivered', deliveredLitres: 2.0 });
    stops[1] = stops[1].copyWith({ status: 'delivered', deliveredLitres: 1.0 });
    stops[2] = stops[2].copyWith({ status: 'partial', deliveredLitres: 2.0 });
    stops[3] = stops[3].copyWith({ status: 'delivered', deliveredLitres: 1.5 });
    stops[4] = stops[4].copyWith({ status: 'skipped' });
  } else if (mode === 'complete') {
    for (let i = 0; i < stops.length; i++) {
      stops[i] = stops[i].copyWith({ status: 'delivered', deliveredLitres: stops[i].scheduledLitres });
    }
    stops[4] = stops[4].copyWith({ status: 'skipped' });
  }
  // 'morning' / 'off' -> base stops (all pending)

  return new RouteSummary({ executiveName: EXEC, dateLabel: DATE, routeLabel: ROUTE, stops });
}
