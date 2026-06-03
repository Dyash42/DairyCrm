/**
 * Mock data for screens until backend is wired.
 * Numbers match the approved design PDF (Berhampur cluster, 2 Jun 2026).
 */

import type {
  Customer,
  DashboardMetrics,
  Executive,
  Route,
} from '@jharanai/shared';

// ---------- Dashboard ----------
export const dashboardMetrics: DashboardMetrics = {
  range: 'TODAY',
  litresDelivered: 842,
  litresDeltaPct: 6.2,
  customersServed: 388,
  customersScheduled: 412,
  customersDeltaPct: 2.1,
  revenue: 53888,
  revenueDeltaPct: 5.4,
  completionPct: 94,
  completionDeltaPct: 1.8,
  hourlyDelivery: [
    { hour: 6, litres: 60 },
    { hour: 7, litres: 180 },
    { hour: 8, litres: 360 },
    { hour: 9, litres: 540 },
    { hour: 10, litres: 700 },
    { hour: 11, litres: 800 },
    { hour: 12, litres: 842 },
  ],
  breakdown: {
    pending: 18,
    missed: 6,
    paused: 22,
    newToday: 9,
  },
  byRoute: [
    { routeName: 'Route 1', litres: 178, completionPct: 97 },
    { routeName: 'Route 2', litres: 146, completionPct: 91 },
    { routeName: 'Route 3', litres: 132, completionPct: 88 },
    { routeName: 'Route 4', litres: 156, completionPct: 94 },
    { routeName: 'Route 5', litres: 118, completionPct: 90 },
    { routeName: 'Route 6', litres: 112, completionPct: 0 },
  ],
  subscriptions: {
    active: 412,
    paused: 46,
    cancelled: 28,
    total: 486,
  },
};

// ---------- Routes ----------
export const executives: Executive[] = [
  { id: 'e1', name: 'Manas Behera', phone: '+91 90000 00001', routeId: 'r1', active: true },
  { id: 'e2', name: 'Pradeep Sahu', phone: '+91 90000 00002', routeId: 'r2', active: true },
  { id: 'e3', name: 'Lipun Nayak', phone: '+91 90000 00003', routeId: 'r3', active: true },
  { id: 'e4', name: 'Ramesh Sahu', phone: '+91 90000 00004', routeId: 'r4', active: true },
  { id: 'e5', name: 'Bibhuti Pradhan', phone: '+91 90000 00005', routeId: 'r5', active: true },
];

export const routes: Route[] = [
  {
    id: 'r1',
    name: 'Route 1',
    area: 'Berhampur North',
    pinCodes: ['760001', '760002'],
    executiveId: 'e1',
    customerCount: 86,
    todayCompletion: 97,
  },
  {
    id: 'r2',
    name: 'Route 2',
    area: 'Gosaninuagaon',
    pinCodes: ['760003'],
    executiveId: 'e2',
    customerCount: 72,
    todayCompletion: 91,
  },
  {
    id: 'r3',
    name: 'Route 3',
    area: 'Gajapati Nagar',
    pinCodes: ['760010'],
    executiveId: 'e3',
    customerCount: 64,
    todayCompletion: 88,
  },
  {
    id: 'r4',
    name: 'Route 4',
    area: 'Berhampur South',
    pinCodes: ['760004', '760007'],
    executiveId: 'e4',
    customerCount: 78,
    todayCompletion: 94,
  },
  {
    id: 'r5',
    name: 'Route 5',
    area: 'Aska Road',
    pinCodes: ['760006'],
    executiveId: 'e5',
    customerCount: 58,
    todayCompletion: 90,
  },
  {
    id: 'r6',
    name: 'Route 6',
    area: 'Hill Patna',
    pinCodes: ['760005'],
    executiveId: undefined,
    customerCount: 54,
    todayCompletion: undefined,
  },
];

// ---------- Customers ----------
export const customers: Customer[] = [
  {
    id: 'c1',
    code: 'JHR-100455',
    name: 'Sunil Pradhan',
    phone: '+91 91111 11111',
    addressLine1: 'Gandhi Nagar',
    routeId: 'r4',
    status: 'ACTIVE',
    litresPerDay: 2.0,
    balance: 0,
    createdAt: '2026-01-10',
    updatedAt: '2026-06-01',
  },
  {
    id: 'c2',
    code: 'JHR-100482',
    name: 'Subhransu Behera',
    phone: '+91 91111 11112',
    addressLine1: 'Gajapati Nagar',
    routeId: 'r3',
    status: 'ACTIVE',
    litresPerDay: 1.0,
    balance: 0,
    createdAt: '2026-02-05',
    updatedAt: '2026-06-01',
  },
  {
    id: 'c3',
    code: 'JHR-100390',
    name: 'Anita Sahoo',
    phone: '+91 91111 11113',
    addressLine1: 'Sasibhushan Ln',
    routeId: 'r4',
    status: 'ACTIVE',
    litresPerDay: 1.0,
    balance: 0,
    createdAt: '2026-01-15',
    updatedAt: '2026-06-01',
  },
  {
    id: 'c4',
    code: 'JHR-100501',
    name: 'Bijay Patnaik',
    phone: '+91 91111 11114',
    addressLine1: 'Surya Vihar',
    routeId: 'r4',
    status: 'PAUSED',
    litresPerDay: 3.0,
    balance: 0,
    createdAt: '2026-02-20',
    updatedAt: '2026-05-25',
  },
  {
    id: 'c5',
    code: 'JHR-100214',
    name: 'Lopamudra Das',
    phone: '+91 91111 11115',
    addressLine1: 'Aska Road',
    routeId: 'r4',
    status: 'ACTIVE',
    litresPerDay: 1.5,
    balance: -128,
    createdAt: '2026-01-08',
    updatedAt: '2026-06-01',
  },
  {
    id: 'c6',
    code: 'JHR-100377',
    name: 'Rabindra Mohanty',
    phone: '+91 91111 11116',
    addressLine1: 'Gajapati Nagar',
    routeId: 'r1',
    status: 'ACTIVE',
    litresPerDay: 2.0,
    balance: 0,
    createdAt: '2026-02-01',
    updatedAt: '2026-06-01',
  },
  {
    id: 'c7',
    code: 'JHR-100620',
    name: 'Priyanka Behera',
    phone: '+91 91111 11117',
    addressLine1: 'Giri Market',
    routeId: 'r2',
    status: 'ACTIVE',
    litresPerDay: 1.0,
    balance: 0,
    createdAt: '2026-03-10',
    updatedAt: '2026-06-01',
  },
  {
    id: 'c8',
    code: 'JHR-100118',
    name: 'Susanta Nayak',
    phone: '+91 91111 11118',
    addressLine1: 'Engg School Rd',
    routeId: 'r5',
    status: 'ACTIVE',
    litresPerDay: 4.0,
    balance: 0,
    createdAt: '2026-01-02',
    updatedAt: '2026-06-01',
  },
  {
    id: 'c9',
    code: 'JHR-100455b',
    name: 'Manoj Rout',
    phone: '+91 91111 11119',
    addressLine1: 'Komapalli',
    routeId: 'r2',
    status: 'CANCELLED',
    litresPerDay: 1.5,
    balance: 0,
    createdAt: '2026-01-12',
    updatedAt: '2026-04-05',
  },
  {
    id: 'c10',
    code: 'JHR-100712',
    name: 'Gayatri Panda',
    phone: '+91 91111 11120',
    addressLine1: 'Hill Patna',
    routeId: 'r1',
    status: 'ACTIVE',
    litresPerDay: 2.5,
    balance: 0,
    createdAt: '2026-04-01',
    updatedAt: '2026-06-01',
  },
  {
    id: 'c11',
    code: 'JHR-100089',
    name: 'Debasish Sahu',
    phone: '+91 91111 11121',
    addressLine1: 'Ankuli',
    routeId: 'r3',
    status: 'PAUSED',
    litresPerDay: 1.0,
    balance: 0,
    createdAt: '2026-01-05',
    updatedAt: '2026-05-20',
  },
  {
    id: 'c12',
    code: 'JHR-100644',
    name: 'Sasmita Jena',
    phone: '+91 91111 11122',
    addressLine1: 'Aska Road',
    routeId: 'r5',
    status: 'ACTIVE',
    litresPerDay: 1.5,
    balance: -64,
    createdAt: '2026-03-15',
    updatedAt: '2026-06-01',
  },
];

export function getRouteName(id?: string): string | undefined {
  if (!id) return undefined;
  return routes.find((r) => r.id === id)?.name;
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');
}
