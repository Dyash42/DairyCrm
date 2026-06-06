/**
 * Database seed — populates the Berhampur cluster used in the admin mocks.
 *
 * Run: npm run db:seed   (after npm run db:migrate)
 *
 * Idempotent: uses `upsert` everywhere so running twice is safe.
 */

import { PrismaClient, UserRole, CustomerStatus } from '@prisma/client';

const prisma = new PrismaClient();

type SeedRoute = {
  id: string;
  name: string;
  area: string;
  pinCodes: string[];
};

type SeedExecutive = {
  id: string;
  name: string;
  phone: string;
  routeId: string | null;
};

type SeedCustomer = {
  code: string;
  name: string;
  phone: string;
  addressLine1: string;
  routeId: string | null;
  status: CustomerStatus;
  litresPerDay: number;
  balance: number;
};

const ROUTES: SeedRoute[] = [
  { id: 'r1', name: 'Route 1', area: 'Berhampur North', pinCodes: ['760001', '760002'] },
  { id: 'r2', name: 'Route 2', area: 'Gosaninuagaon', pinCodes: ['760003'] },
  { id: 'r3', name: 'Route 3', area: 'Gajapati Nagar', pinCodes: ['760010'] },
  { id: 'r4', name: 'Route 4', area: 'Berhampur South', pinCodes: ['760004', '760007'] },
  { id: 'r5', name: 'Route 5', area: 'Aska Road', pinCodes: ['760006'] },
  { id: 'r6', name: 'Route 6', area: 'Hill Patna', pinCodes: ['760005'] },
];

const EXECUTIVES: SeedExecutive[] = [
  { id: 'e1', name: 'Manas Behera', phone: '+919000000001', routeId: 'r1' },
  { id: 'e2', name: 'Pradeep Sahu', phone: '+919000000002', routeId: 'r2' },
  { id: 'e3', name: 'Lipun Nayak', phone: '+919000000003', routeId: 'r3' },
  { id: 'e4', name: 'Ramesh Sahu', phone: '+919000000004', routeId: 'r4' },
  { id: 'e5', name: 'Bibhuti Pradhan', phone: '+919000000005', routeId: 'r5' },
  // Route 6 (Hill Patna) intentionally unassigned — drives the dashboard alert.
];

const CUSTOMERS: SeedCustomer[] = [
  { code: 'JHR-100455', name: 'Sunil Pradhan', phone: '+919111111111', addressLine1: 'Gandhi Nagar', routeId: 'r4', status: CustomerStatus.ACTIVE, litresPerDay: 2.0, balance: 0 },
  { code: 'JHR-100482', name: 'Subhransu Behera', phone: '+919111111112', addressLine1: 'Gajapati Nagar', routeId: 'r3', status: CustomerStatus.ACTIVE, litresPerDay: 1.0, balance: 0 },
  { code: 'JHR-100390', name: 'Anita Sahoo', phone: '+919111111113', addressLine1: 'Sasibhushan Ln', routeId: 'r4', status: CustomerStatus.ACTIVE, litresPerDay: 1.0, balance: 0 },
  { code: 'JHR-100501', name: 'Bijay Patnaik', phone: '+919111111114', addressLine1: 'Surya Vihar', routeId: 'r4', status: CustomerStatus.PAUSED, litresPerDay: 3.0, balance: 0 },
  { code: 'JHR-100214', name: 'Lopamudra Das', phone: '+919111111115', addressLine1: 'Aska Road', routeId: 'r4', status: CustomerStatus.ACTIVE, litresPerDay: 1.5, balance: -128 },
  { code: 'JHR-100377', name: 'Rabindra Mohanty', phone: '+919111111116', addressLine1: 'Gajapati Nagar', routeId: 'r1', status: CustomerStatus.ACTIVE, litresPerDay: 2.0, balance: 0 },
  { code: 'JHR-100620', name: 'Priyanka Behera', phone: '+919111111117', addressLine1: 'Giri Market', routeId: 'r2', status: CustomerStatus.ACTIVE, litresPerDay: 1.0, balance: 0 },
  { code: 'JHR-100118', name: 'Susanta Nayak', phone: '+919111111118', addressLine1: 'Engg School Rd', routeId: 'r5', status: CustomerStatus.ACTIVE, litresPerDay: 4.0, balance: 0 },
  { code: 'JHR-100455b', name: 'Manoj Rout', phone: '+919111111119', addressLine1: 'Komapalli', routeId: 'r2', status: CustomerStatus.CANCELLED, litresPerDay: 1.5, balance: 0 },
  { code: 'JHR-100712', name: 'Gayatri Panda', phone: '+919111111120', addressLine1: 'Hill Patna', routeId: 'r1', status: CustomerStatus.ACTIVE, litresPerDay: 2.5, balance: 0 },
  { code: 'JHR-100089', name: 'Debasish Sahu', phone: '+919111111121', addressLine1: 'Ankuli', routeId: 'r3', status: CustomerStatus.PAUSED, litresPerDay: 1.0, balance: 0 },
  { code: 'JHR-100644', name: 'Sasmita Jena', phone: '+919111111122', addressLine1: 'Aska Road', routeId: 'r5', status: CustomerStatus.ACTIVE, litresPerDay: 1.5, balance: -64 },
];

async function main() {
  console.log('[seed] starting…');

  // --- Admin user ---
  await prisma.user.upsert({
    where: { phone: '+919999999999' },
    create: {
      role: UserRole.ADMIN,
      name: 'Anil Das',
      phone: '+919999999999',
      email: 'anil@jharanai.local',
    },
    update: {},
  });

  // --- Routes ---
  for (const r of ROUTES) {
    await prisma.route.upsert({
      where: { id: r.id },
      create: r,
      update: { name: r.name, area: r.area, pinCodes: r.pinCodes },
    });
  }
  console.log(`[seed] routes: ${ROUTES.length}`);

  // --- Executives (each with a User row) ---
  for (const e of EXECUTIVES) {
    const user = await prisma.user.upsert({
      where: { phone: e.phone },
      create: { role: UserRole.EXECUTIVE, name: e.name, phone: e.phone },
      update: { name: e.name },
    });
    await prisma.executive.upsert({
      where: { id: e.id },
      create: { id: e.id, userId: user.id, routeId: e.routeId },
      update: { routeId: e.routeId },
    });
  }
  console.log(`[seed] executives: ${EXECUTIVES.length}`);

  // --- Customers ---
  for (const c of CUSTOMERS) {
    await prisma.customer.upsert({
      where: { code: c.code },
      create: {
        code: c.code,
        name: c.name,
        phone: c.phone,
        addressLine1: c.addressLine1,
        routeId: c.routeId,
        status: c.status,
        litresPerDay: c.litresPerDay,
        balance: c.balance,
      },
      update: {
        name: c.name,
        addressLine1: c.addressLine1,
        routeId: c.routeId,
        status: c.status,
        litresPerDay: c.litresPerDay,
        balance: c.balance,
      },
    });
  }
  console.log(`[seed] customers: ${CUSTOMERS.length}`);

  // --- Customer code counter --- seed so newly-generated codes don't collide
  // with our hand-picked seed codes (which go up to JHR-100712).
  await prisma.customerCodeCounter.upsert({
    where: { key: 'customer' },
    create: { key: 'customer', lastValue: 100712 },
    update: { lastValue: 100712 },
  });
  console.log('[seed] customer code counter: 100712 (next code will be JHR-100713)');

  // --- Holiday calendar --- a couple of well-known Indian festivals
  const holidays = [
    { date: new Date('2026-08-15'), reason: 'Independence Day' },
    { date: new Date('2026-10-02'), reason: 'Gandhi Jayanti' },
    { date: new Date('2026-11-08'), reason: 'Diwali' },
  ];
  for (const h of holidays) {
    await prisma.holidayCalendar.upsert({
      where: { date: h.date },
      create: { ...h, scope: 'ALL' },
      update: { reason: h.reason },
    });
  }
  console.log(`[seed] holidays: ${holidays.length}`);

  console.log('[seed] done.');
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
