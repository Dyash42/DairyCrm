/**
 * Database seed — populates the Berhampur cluster used in the admin mocks.
 *
 * Run: npm run db:seed   (after npm run db:migrate)
 *
 * Idempotent: uses `upsert` everywhere so running twice is safe.
 */

import {
  PrismaClient,
  UserRole,
  CustomerStatus,
  ProductCategory,
  SettingType,
  DeliveryStatus,
  SubscriptionStatus,
  BroadcastTarget,
  BroadcastStatus,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

import { startOfBusinessDayUTC, addDays } from '../src/utils/dates';

const prisma = new PrismaClient();

/**
 * Demo password for the seeded admin user.
 * Login at /login as anil@jharanai.local / demo1234.
 *
 * Override with SEED_ADMIN_PASSWORD env var in production seeds — and DO
 * NOT run this seed against a production DB without overriding.
 */
const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'demo1234';

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
  // Includes a bcrypt password hash so the admin login flow works out of
  // the box: anil@jharanai.local / demo1234 (or whatever
  // SEED_ADMIN_PASSWORD was set to).
  const adminPasswordHash = await bcrypt.hash(SEED_ADMIN_PASSWORD, 10);
  await prisma.user.upsert({
    where: { phone: '+919999999999' },
    create: {
      role: UserRole.ADMIN,
      name: 'Anil Das',
      phone: '+919999999999',
      email: 'anil@jharanai.local',
      passwordHash: adminPasswordHash,
    },
    // Keep the password fresh on re-seed so demo logins never break if
    // someone rotates the SEED_ADMIN_PASSWORD env var.
    update: { passwordHash: adminPasswordHash },
  });
  console.log(`[seed] admin login: anil@jharanai.local / ${SEED_ADMIN_PASSWORD}`);

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
      where: { date_scope: { date: h.date, scope: 'ALL' } },
      create: { ...h, scope: 'ALL' },
      update: { reason: h.reason },
    });
  }
  console.log(`[seed] holidays: ${holidays.length}`);

  // --- Products --- the SKUs admins start with; they can add more anytime
  const products = [
    { code: 'COW_MILK', name: 'Cow milk', category: ProductCategory.MILK, ratePerUnit: 64, unit: 'L', sortOrder: 1 },
    { code: 'BUFFALO_MILK', name: 'Buffalo milk', category: ProductCategory.MILK, ratePerUnit: 78, unit: 'L', sortOrder: 2 },
    { code: 'A2_MILK', name: 'A2 milk', category: ProductCategory.MILK, ratePerUnit: 110, unit: 'L', sortOrder: 3, active: false },
    { code: 'CURD_500', name: 'Curd 500g', category: ProductCategory.CURD, ratePerUnit: 55, unit: 'pcs', sortOrder: 10 },
    { code: 'GHEE_200', name: 'Ghee 200ml', category: ProductCategory.GHEE, ratePerUnit: 280, unit: 'pcs', sortOrder: 20, active: false },
  ];
  for (const p of products) {
    await prisma.product.upsert({
      where: { code: p.code },
      create: { ...p, active: p.active ?? true },
      update: { name: p.name, category: p.category, ratePerUnit: p.ratePerUnit, unit: p.unit, sortOrder: p.sortOrder },
    });
  }
  console.log(`[seed] products: ${products.length}`);

  // --- Settings --- write defaults so the admin Settings page renders with
  // editable rows out of the box. SettingsService still falls back to the
  // defaults if a row is missing, so deleting a row is safe.
  const settings = [
    { key: 'subscription.default_duration_days', value: '30', type: SettingType.NUMBER, group: 'subscription', label: 'Default subscription length (days)' },
    { key: 'subscription.renewal_reminder_days_before', value: '3', type: SettingType.NUMBER, group: 'subscription', label: 'Renewal reminder window (days before expiry)' },
    { key: 'pause.max_days', value: '60', type: SettingType.NUMBER, group: 'pause', label: 'Maximum pause length (days)' },
    { key: 'delivery.morning_window_start', value: '"05:30"', type: SettingType.STRING, group: 'delivery', label: 'Morning delivery window start' },
    { key: 'delivery.morning_window_end', value: '"08:30"', type: SettingType.STRING, group: 'delivery', label: 'Morning delivery window end' },
    { key: 'customer.code_prefix', value: '"JHR"', type: SettingType.STRING, group: 'customer', label: 'Customer code prefix' },
    { key: 'otp.length', value: '6', type: SettingType.NUMBER, group: 'otp', label: 'OTP digit length' },
    { key: 'otp.expiry_minutes', value: '5', type: SettingType.NUMBER, group: 'otp', label: 'OTP expiry (minutes)' },
    { key: 'business.brand_name', value: '"Jharanai"', type: SettingType.STRING, group: 'business', label: 'Brand name' },
  ];
  for (const s of settings) {
    await prisma.setting.upsert({
      where: { key: s.key },
      create: s,
      update: { label: s.label, group: s.group, type: s.type },
    });
  }
  console.log(`[seed] settings: ${settings.length}`);

  // --- Today's deliveries --- one PENDING row per active customer-with-route
  // so the dashboard and the mobile Today's Route screen render real data
  // for whoever signs in today. Idempotent via the (customerId, scheduledFor)
  // unique key so re-seeding doesn't wipe a delivery a dev already marked.
  // Use the SAME business-day boundary the runtime queries by (IST-aligned
  // UTC midnight). Previously this was local-midnight (new Date()+setHours),
  // which on an IST machine stored 18:30 UTC and never matched the handler's
  // startOfBusinessDayUTC() — so the milkman's Today's Route came up empty.
  const today = startOfBusinessDayUTC();

  const execByRoute = new Map<string, string>();
  for (const e of EXECUTIVES) {
    if (e.routeId) execByRoute.set(e.routeId, e.id);
  }
  const cowMilkRate = 64;

  let deliveryCount = 0;
  for (const c of CUSTOMERS) {
    if (c.status !== CustomerStatus.ACTIVE || !c.routeId) continue;
    const customer = await prisma.customer.findUnique({ where: { code: c.code } });
    if (!customer) continue;
    await prisma.delivery.upsert({
      where: { customerId_scheduledFor: { customerId: customer.id, scheduledFor: today } },
      create: {
        customerId: customer.id,
        routeId: c.routeId,
        executiveId: execByRoute.get(c.routeId) ?? null,
        scheduledLitres: c.litresPerDay,
        ratePerLitre: cowMilkRate,
        status: DeliveryStatus.PENDING,
        scheduledFor: today,
      },
      update: {
        executiveId: execByRoute.get(c.routeId) ?? null,
      },
    });
    deliveryCount += 1;
  }
  console.log(`[seed] today's deliveries: ${deliveryCount}`);

  // --- Demo customers --- a few clearly-labelled rows on Route 4 (Ramesh
  // Sahu's route, exec phone 9000000004) so there's obvious fresh data to
  // see, edit and reassign from the admin panel while testing the
  // admin → DB → milkman-app wiring.
  const demoCustomers = [
    { code: 'JHR-100801', name: 'Demo Customer One', phone: '+919900000801', addressLine1: 'Demo House 1, Gandhi Nagar', routeId: 'r4', litresPerDay: 1 },
    { code: 'JHR-100802', name: 'Demo Customer Two', phone: '+919900000802', addressLine1: 'Demo House 2, Gandhi Nagar', routeId: 'r4', litresPerDay: 2 },
    { code: 'JHR-100803', name: 'Demo Customer Three', phone: '+919900000803', addressLine1: 'Demo House 3, Gandhi Nagar', routeId: 'r4', litresPerDay: 1.5 },
  ];
  for (const d of demoCustomers) {
    await prisma.customer.upsert({
      where: { code: d.code },
      create: { ...d, status: CustomerStatus.ACTIVE, balance: 0 },
      update: { name: d.name, addressLine1: d.addressLine1, routeId: d.routeId, status: CustomerStatus.ACTIVE, litresPerDay: d.litresPerDay },
    });
  }
  console.log(`[seed] demo customers: ${demoCustomers.length}`);

  // --- Subscriptions --- the seed historically created Delivery rows
  // directly but no Subscription rows, so the lazy materializer (and the
  // daily route-gen job) had nothing to expand and FUTURE days came up
  // empty. Give every active, routed customer an ACTIVE daily COW_MILK
  // subscription (idempotent: skip if one already exists) so the route
  // materializes every day — this is what makes admin edits flow through
  // to the milkman's app naturally rather than only for hand-seeded rows.
  const cowProduct = await prisma.product.findUnique({ where: { code: 'COW_MILK' } });
  const subEnd = addDays(today, 30);
  const routedActive = await prisma.customer.findMany({
    where: { status: CustomerStatus.ACTIVE, routeId: { not: null } },
  });
  let subCount = 0;
  for (const customer of routedActive) {
    const existing = await prisma.subscription.findFirst({
      where: { customerId: customer.id, status: SubscriptionStatus.ACTIVE },
    });
    if (existing) continue;
    await prisma.subscription.create({
      data: {
        customerId: customer.id,
        productId: cowProduct?.id ?? null,
        sku: 'COW_MILK',
        litresPerDay: customer.litresPerDay,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        ratePerLitre: cowMilkRate,
        startDate: today,
        endDate: subEnd,
        status: SubscriptionStatus.ACTIVE,
      },
    });
    subCount += 1;
  }
  console.log(`[seed] subscriptions: ${subCount}`);

  // Direct today-deliveries for the demo customers so the dashboard and the
  // milkman's Today's Route show them immediately (the materializer would
  // also create these on the first /deliveries/today call).
  for (const d of demoCustomers) {
    const customer = await prisma.customer.findUnique({ where: { code: d.code } });
    if (!customer) continue;
    await prisma.delivery.upsert({
      where: { customerId_scheduledFor: { customerId: customer.id, scheduledFor: today } },
      create: {
        customerId: customer.id,
        routeId: d.routeId,
        executiveId: execByRoute.get(d.routeId) ?? null,
        scheduledLitres: d.litresPerDay,
        ratePerLitre: cowMilkRate,
        status: DeliveryStatus.PENDING,
        scheduledFor: today,
      },
      update: { executiveId: execByRoute.get(d.routeId) ?? null },
    });
  }

  // --- Broadcasts --- a couple of demo rows so /broadcasts has content
  const activeCount = CUSTOMERS.filter((c) => c.status === CustomerStatus.ACTIVE).length;
  const broadcasts = [
    {
      id: 'bc-demo-1',
      message: 'Holiday tomorrow — no delivery on Independence Day. Resumes Saturday.',
      target: BroadcastTarget.ALL,
      status: BroadcastStatus.SENT,
      sentCount: activeCount,
      deliveredCount: activeCount,
    },
    {
      id: 'bc-demo-2',
      message: 'Route 6 (Hill Patna) delivery delayed by 30 minutes today.',
      target: BroadcastTarget.ROUTES,
      status: BroadcastStatus.DRAFT,
      sentCount: 0,
      deliveredCount: 0,
    },
  ];
  for (const b of broadcasts) {
    await prisma.broadcast.upsert({
      where: { id: b.id },
      create: b,
      update: { message: b.message, status: b.status },
    });
  }
  await prisma.broadcastRoute.upsert({
    where: { broadcastId_routeId: { broadcastId: 'bc-demo-2', routeId: 'r6' } },
    create: { broadcastId: 'bc-demo-2', routeId: 'r6' },
    update: {},
  });
  console.log(`[seed] broadcasts: ${broadcasts.length}`);

  // --- Bot prompts --- editable session-window strings the WhatsApp bot
  // says inside a customer's active conversation. NOT Meta-approved
  // templates (those live in src/whatsapp/templates.ts and must be edited
  // in WhatsApp Manager). Admins edit these via /bot-prompts.
  type SeedBotPrompt = {
    key: string;
    flow: string;
    label: string;
    kind: 'text' | 'buttons' | 'list';
    body: string;
    buttons?: { id: string; title: string }[];
    rows?: { id: string; title: string; description?: string }[];
    variables: string[];
    sortOrder: number;
    notes?: string;
  };
  const botPrompts: SeedBotPrompt[] = [
    // ── Onboarding ──
    { key: 'onboarding.ask_address', flow: 'onboarding', label: 'Onboarding · Ask delivery address',
      kind: 'text', body: 'Thanks, ${firstName}! What is your delivery address?',
      variables: ['firstName'], sortOrder: 10,
      notes: 'Sent after the customer replies with their name. ${firstName} is the first token of their reply.' },
    { key: 'onboarding.ask_email', flow: 'onboarding', label: 'Onboarding · Ask email',
      kind: 'text', body: 'Got it. Your email for digital receipts?', variables: [], sortOrder: 20 },
    { key: 'onboarding.ask_alt_phone', flow: 'onboarding', label: 'Onboarding · Ask alternate phone',
      kind: 'text', body: 'An alternate mobile number (optional)?', variables: [], sortOrder: 30,
      notes: 'Customer can reply "skip", "no", or "-" to bypass.' },
    { key: 'onboarding.ask_litres', flow: 'onboarding', label: 'Onboarding · Ask daily litres',
      kind: 'text', body: 'How much milk would you like every day?', variables: [], sortOrder: 40 },
    { key: 'onboarding.ask_litres.retry', flow: 'onboarding', label: 'Onboarding · Litres retry',
      kind: 'text', body: "Sorry, I didn't catch that. Please reply with a number like '1' or '1.5'.",
      variables: [], sortOrder: 41,
      notes: 'Shown when the customer reply is not a valid number between 0 and 50. Stays on the same step.' },
    { key: 'onboarding.creating_account', flow: 'onboarding', label: 'Onboarding · Creating account interstitial',
      kind: 'text', body: 'Creating your account…', variables: [], sortOrder: 50,
      notes: 'Status message sent right before the customer record is written to the database.' },
    { key: 'onboarding.qr_caption', flow: 'onboarding', label: 'Onboarding · QR image caption',
      kind: 'text', body: 'Your Jharanai QR · ${customerCode}\nShow this to your milkman at delivery.',
      variables: ['customerCode'], sortOrder: 60,
      notes: 'Caption attached to the QR image we send the customer. The "·" is a middle-dot separator (not a hyphen).' },
    { key: 'onboarding.ask_days', flow: 'onboarding', label: 'Onboarding · Ask subscription days',
      kind: 'text', body: 'For how many days would you like to subscribe?', variables: [], sortOrder: 70 },
    { key: 'onboarding.ask_days.retry', flow: 'onboarding', label: 'Onboarding · Days retry',
      kind: 'text', body: "Please reply with a number of days, e.g. '30'.", variables: [], sortOrder: 71,
      notes: 'Shown when the days reply is not a valid integer between 1 and 365.' },

    // ── Menu ──
    { key: 'menu.returning.welcome', flow: 'menu', label: 'Menu · Returning customer welcome',
      kind: 'list', body: 'Welcome back, ${customerName}! 👋 What would you like to do today?',
      rows: [
        { id: 'renew', title: 'Renew subscription' },
        { id: 'pause', title: 'Pause deliveries' },
        { id: 'resume', title: 'Resume' },
        { id: 'support', title: 'Support' },
      ],
      variables: ['customerName'], sortOrder: 10,
      notes: 'Shown when a known customer texts a greeting like "hi" or "menu". Row IDs are locked — only labels are editable.' },
    { key: 'menu.returning.button_text', flow: 'menu', label: 'Menu · List CTA',
      kind: 'text', body: 'Choose an option', variables: [], sortOrder: 20,
      notes: 'Label on the button that opens the menu list. Keep it short (WhatsApp caps at ~20 chars).' },
    { key: 'menu.returning.section_title.manage', flow: 'menu', label: 'Menu · Section heading',
      kind: 'text', body: 'Manage your subscription', variables: [], sortOrder: 30 },

    // ── Pause ──
    { key: 'pause.ask_start', flow: 'pause', label: 'Pause · Ask start date',
      kind: 'text', body: 'Sure. From which date should we pause your deliveries?',
      variables: [], sortOrder: 10 },
    { key: 'pause.ask_start.retry_invalid_date', flow: 'pause', label: 'Pause · Start date retry',
      kind: 'text', body: "Please reply with a date like 'tomorrow' or '3 Jun'.",
      variables: [], sortOrder: 11,
      notes: 'Shown when the start-date reply can\'t be parsed. Bot supports "tomorrow", "today", "3 Jun", "03/06", "2026-06-03".' },
    { key: 'pause.ask_end', flow: 'pause', label: 'Pause · Ask end date',
      kind: 'text', body: 'And until which date?', variables: [], sortOrder: 20 },
    { key: 'pause.ask_end.retry_invalid_date', flow: 'pause', label: 'Pause · End date retry',
      kind: 'text', body: "Please reply with an end date like '9 Jun'.",
      variables: [], sortOrder: 21 },
    { key: 'pause.confirm.body', flow: 'pause', label: 'Pause · Confirm prompt',
      kind: 'buttons',
      body: 'To confirm: deliveries paused ${start} – ${date} (${days} days). No milk, no charge for these days.',
      buttons: [
        { id: 'pause_confirm', title: 'Confirm pause' },
        { id: 'pause_cancel', title: 'Cancel' },
      ],
      variables: ['start', 'date', 'days'], sortOrder: 30,
      notes: 'start = ISO start date, date = ISO end date, days = inclusive day count. Button IDs are locked (engine matches "pause_confirm").' },
    { key: 'pause.confirm.cancelled', flow: 'pause', label: 'Pause · Cancelled acknowledgement',
      kind: 'text', body: 'Pause cancelled. Anything else?', variables: [], sortOrder: 40,
      notes: 'Shown when the customer taps Cancel or sends anything other than the Confirm button.' },

    // ── Resume ──
    { key: 'resume.ask_choice.body', flow: 'resume', label: 'Resume · Ask resume choice',
      kind: 'buttons',
      body: 'Your subscription is currently paused until ${endLabel}. Would you like to resume earlier?',
      buttons: [
        { id: 'resume_tomorrow', title: 'Resume from tomorrow' },
        { id: 'resume_cancel', title: 'Keep pause' },
      ],
      variables: ['endLabel'], sortOrder: 10,
      notes: '${endLabel} is the formatted pause end date like "12 Jun", or "today" if there\'s no active pause. Button IDs are locked.' },
    { key: 'resume.decline.body', flow: 'resume', label: 'Resume · Decline acknowledgement',
      kind: 'text', body: 'No problem, your pause stays as is.', variables: [], sortOrder: 20 },

    // ── Support ──
    { key: 'support.ask_kind.body', flow: 'support', label: 'Support · Ask issue type',
      kind: 'buttons', body: 'How can we help you today?',
      buttons: [
        { id: 'missed', title: 'Missed delivery' },
        { id: 'other', title: 'Other' },
      ],
      variables: [], sortOrder: 10,
      notes: 'Button IDs are locked. Only "missed" advances the flow; "other" / free text triggers the handoff message.' },
    { key: 'support.await_kind.handoff', flow: 'support', label: 'Support · Handoff acknowledgement',
      kind: 'text', body: 'Got it — a teammate will reach out shortly.', variables: [], sortOrder: 20 },
  ];

  for (const p of botPrompts) {
    await prisma.botPrompt.upsert({
      where: { key: p.key },
      create: {
        key: p.key,
        flow: p.flow,
        label: p.label,
        kind: p.kind,
        body: p.body,
        buttons: p.buttons ?? undefined,
        rows: p.rows ?? undefined,
        variables: p.variables,
        sortOrder: p.sortOrder,
        notes: p.notes ?? null,
      },
      update: {
        // Re-seed refreshes structural fields (label, sortOrder, kind, variables,
        // notes) but PRESERVES the body / buttons / rows the admin may have
        // already edited. To re-baseline copy too, add SEED_RESET_BOT_PROMPTS=1
        // to the env when running the seed.
        flow: p.flow,
        label: p.label,
        kind: p.kind,
        variables: p.variables,
        sortOrder: p.sortOrder,
        notes: p.notes ?? null,
        ...(process.env.SEED_RESET_BOT_PROMPTS === '1'
          ? { body: p.body, buttons: p.buttons ?? undefined, rows: p.rows ?? undefined }
          : {}),
      },
    });
  }
  console.log(`[seed] bot prompts: ${botPrompts.length}`);

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
