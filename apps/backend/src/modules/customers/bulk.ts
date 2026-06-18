/**
 * Bulk customer import endpoints.
 *
 *   GET    /customers/bulk/template   — downloadable CSV with headers + 3 example rows
 *   POST   /customers/bulk/validate   — { csv } → parsed + DB-cross-checked preview
 *   POST   /customers/bulk/commit     — { rows } → create customers + subs + QrCode rows
 *
 * The PRD workflow: admin downloads template → fills 400-500 rows in Excel
 * → uploads → previews errors → commits. New customers (post-launch) come
 * in via WhatsApp; this is for ONE-TIME onboarding migration.
 */

import type { App } from '../../types';
import { z } from 'zod';
import { CustomerStatus, QrCodeStatus, SubscriptionStatus, RenewalReminderStatus } from '@prisma/client';

import { prisma } from '../../prisma';
import {
  buildTemplateCsv,
  validateCsv,
  type ValidatedRow,
  type ValidationIssue,
} from '../../services/bulk-customer-import';
import { nextCustomerCode } from '../../services/customer-code';
import { generateQrDataUrl, buildVersionedQrPayload } from '../../services/qrcode';
import { settings } from '../../services/settings';
import { DEFAULT_RATE_PER_LITRE_INR } from '../../constants';

const ValidateBody = z.object({
  csv: z.string().min(1),
});

const CommitBody = z.object({
  rows: z.array(z.unknown()).min(1).max(2000),
});

/**
 * SEC-03/ADM-04: strict server-side schema for a committed row. /commit is a
 * trust boundary — the /validate preview runs in the browser, so a crafted POST
 * could otherwise smuggle out-of-range litres, negative/huge durations,
 * malformed phones/codes, or unbounded strings straight into the DB. Every row
 * is re-validated against this before any write; bad rows go to `failures`.
 * Mirrors the field rules in services/bulk-customer-import.ts validateCsv.
 */
const CommitRow = z.object({
  row: z.coerce.number().int().nonnegative().catch(0),
  name: z.string().trim().min(1).max(120),
  phone: z.string().regex(/^\+\d{10,15}$/, 'phone must be normalized E.164 (+<digits>)'),
  altPhone: z.string().regex(/^\+\d{10,15}$/).nullish(),
  email: z.string().email().max(200).nullish(),
  addressLine1: z.string().trim().min(1).max(300),
  area: z.string().trim().max(120).nullish(),
  pinCode: z.string().trim().max(12).nullish(),
  routeName: z.string().trim().min(1).max(120),
  productCode: z.string().trim().min(1).max(60),
  litresPerDay: z.coerce.number().positive().max(50),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  durationDays: z.coerce.number().int().min(1).max(365),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD'),
  customerCode: z
    .string()
    .regex(/^[A-Z]+-\d+$/i, 'customer_code must look like JHR-100123')
    .transform((s) => s.toUpperCase())
    .nullish(),
});

export async function registerCustomerBulkRoutes(app: App) {
  // Template — also reachable without auth so admin can pre-download
  // before logging in if needed. We keep auth on for now since this is
  // internal-only.
  app.addHook('onRequest', app.authenticate);

  app.get('/template', {
    handler: async (_req, reply) => {
      const csv = buildTemplateCsv();
      reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', 'attachment; filename="jharanai-customers-template.csv"')
        .send(csv);
    },
  });

  app.post('/validate', {
    handler: async (req) => {
      const body = ValidateBody.parse(req.body);
      const result = validateCsv(body.csv);

      // Cross-check against the DB:
      //  - phones already registered → flip those rows to errors
      //  - route names that don't exist → error
      //  - product codes that don't exist → error
      //  - codes already in use → error
      const issues: ValidationIssue[] = [...result.issues];
      const validRows: ValidatedRow[] = [];

      if (result.valid.length > 0) {
        const phones = result.valid.map((r) => r.phone);
        const existingPhones = new Set(
          (await prisma.customer.findMany({
            where: { phone: { in: phones } },
            select: { phone: true },
          })).map((c) => c.phone),
        );

        const routeNames = Array.from(new Set(result.valid.map((r) => r.routeName)));
        const routes = await prisma.route.findMany({
          where: { name: { in: routeNames } },
          select: { id: true, name: true },
        });
        const routeByName = new Map(routes.map((r) => [r.name, r.id]));

        const productCodes = Array.from(new Set(result.valid.map((r) => r.productCode)));
        const products = await prisma.product.findMany({
          where: { code: { in: productCodes } },
          select: { id: true, code: true, ratePerUnit: true },
        });
        const productByCode = new Map(products.map((p) => [p.code, p]));

        const claimedCodes = result.codes;
        const existingCodes = new Set(
          claimedCodes.length > 0
            ? (await prisma.customer.findMany({
                where: { code: { in: claimedCodes } },
                select: { code: true },
              })).map((c) => c.code)
            : [],
        );

        for (const row of result.valid) {
          const rowIssues: ValidationIssue[] = [];
          if (existingPhones.has(row.phone)) {
            rowIssues.push({
              row: row.row,
              column: 'phone',
              severity: 'error',
              message: `Phone ${row.phone} already exists in the system`,
            });
          }
          if (!routeByName.has(row.routeName)) {
            rowIssues.push({
              row: row.row,
              column: 'route_name',
              severity: 'error',
              message: `Route "${row.routeName}" doesn't exist. Create it first.`,
            });
          }
          if (!productByCode.has(row.productCode)) {
            rowIssues.push({
              row: row.row,
              column: 'product_code',
              severity: 'error',
              message: `Unknown product "${row.productCode}". Add it on the Products page first.`,
            });
          }
          if (row.customerCode && existingCodes.has(row.customerCode)) {
            rowIssues.push({
              row: row.row,
              column: 'customer_code',
              severity: 'error',
              message: `customer_code ${row.customerCode} is already in use`,
            });
          }
          if (rowIssues.length === 0) {
            validRows.push(row);
          } else {
            issues.push(...rowIssues);
          }
        }
      }

      return {
        valid: validRows,
        issues,
        summary: {
          rowsSubmitted: result.valid.length + result.issues.filter((i) => i.severity === 'error').length,
          rowsValid: validRows.length,
          errorCount: issues.filter((i) => i.severity === 'error').length,
          warningCount: issues.filter((i) => i.severity === 'warning').length,
        },
      };
    },
  });

  app.post('/commit', {
    handler: async (req, reply) => {
      const body = CommitBody.parse(req.body);

      // SEC-03/ADM-04: re-validate EVERY row server-side before any write — the
      // browser /validate preview is not a trust boundary. Bad rows → failures.
      const failures: Array<{ row: number; error: string }> = [];
      const rows: z.infer<typeof CommitRow>[] = [];
      body.rows.forEach((raw, i) => {
        const parsed = CommitRow.safeParse(raw);
        if (parsed.success) {
          rows.push(parsed.data);
        } else {
          const rowNo =
            raw && typeof raw === 'object' && typeof (raw as { row?: unknown }).row === 'number'
              ? (raw as { row: number }).row
              : i + 1;
          failures.push({
            row: rowNo,
            error: parsed.error.issues.map((x) => x.message).join('; ').slice(0, 200),
          });
        }
      });

      // Re-fetch route + product maps so we never trust client-supplied ids.
      const routeNames = Array.from(new Set(rows.map((r) => r.routeName)));
      const productCodes = Array.from(new Set(rows.map((r) => r.productCode)));
      const routes = await prisma.route.findMany({
        where: { name: { in: routeNames } },
      });
      const routeByName = new Map(routes.map((r) => [r.name, r]));
      const products = await prisma.product.findMany({
        where: { code: { in: productCodes } },
      });
      const productByCode = new Map(products.map((p) => [p.code, p]));

      // Re-check phone + code uniqueness against the DB and within the batch —
      // the same checks /validate runs, with the DB unique constraint as the
      // final backstop for cross-request races.
      const existingPhones = new Set(
        (await prisma.customer.findMany({
          where: { phone: { in: rows.map((r) => r.phone) } },
          select: { phone: true },
        })).map((c) => c.phone),
      );
      const claimedCodes = rows
        .map((r) => r.customerCode)
        .filter((c): c is string => !!c);
      const existingCodes = new Set(
        claimedCodes.length
          ? (await prisma.customer.findMany({
              where: { code: { in: claimedCodes } },
              select: { code: true },
            })).map((c) => c.code)
          : [],
      );
      const seenPhones = new Set<string>();
      const seenCodes = new Set<string>();

      const renewalLeadDays = await settings.getNumber(
        'subscription.renewal_reminder_days_before',
        3,
      );

      const createdIds: string[] = [];

      for (const row of rows) {
        try {
          const route = routeByName.get(row.routeName);
          const product = productByCode.get(row.productCode);
          if (!route || !product) {
            failures.push({ row: row.row, error: 'Route or product missing' });
            continue;
          }
          if (existingPhones.has(row.phone) || seenPhones.has(row.phone)) {
            failures.push({ row: row.row, error: `Phone ${row.phone} already exists` });
            continue;
          }
          if (
            row.customerCode &&
            (existingCodes.has(row.customerCode) || seenCodes.has(row.customerCode))
          ) {
            failures.push({
              row: row.row,
              error: `customer_code ${row.customerCode} already in use`,
            });
            continue;
          }
          const rate = Number(product.ratePerUnit) || DEFAULT_RATE_PER_LITRE_INR;

          // Reserve code: prefer requested customer_code if provided, else
          // allocate from counter.
          const code = row.customerCode ?? (await nextCustomerCode(prisma));
          const versionedPayload = buildVersionedQrPayload(code, 1);
          const qrCodeUrl = await generateQrDataUrl(versionedPayload);

          const startDate = new Date(`${row.startDate}T00:00:00.000Z`);
          const endDate = new Date(startDate);
          endDate.setUTCDate(endDate.getUTCDate() + row.durationDays);
          const dueDate = new Date(endDate);
          dueDate.setUTCDate(dueDate.getUTCDate() - renewalLeadDays);

          const result = await prisma.$transaction(async (tx) => {
            const customer = await tx.customer.create({
              data: {
                code,
                name: row.name,
                phone: row.phone,
                altPhone: row.altPhone ?? null,
                email: row.email ?? null,
                addressLine1: row.addressLine1,
                area: row.area ?? null,
                pinCode: row.pinCode ?? null,
                routeId: route.id,
                litresPerDay: row.litresPerDay,
                status: CustomerStatus.ACTIVE,
                qrCodeUrl,
              },
            });
            await tx.qrCode.create({
              data: {
                customerId: customer.id,
                payload: versionedPayload,
                url: qrCodeUrl,
                status: QrCodeStatus.ACTIVE,
                version: 1,
              },
            });
            const sub = await tx.subscription.create({
              data: {
                customerId: customer.id,
                productId: product.id,
                sku: product.code,
                litresPerDay: row.litresPerDay,
                daysOfWeek: row.daysOfWeek,
                ratePerLitre: rate,
                startDate,
                endDate,
                status: SubscriptionStatus.ACTIVE,
              },
            });
            await tx.renewalReminder.create({
              data: {
                subscriptionId: sub.id,
                customerId: customer.id,
                dueDate,
                status: RenewalReminderStatus.PENDING,
              },
            });
            return customer.id;
          });
          createdIds.push(result);
          seenPhones.add(row.phone);
          if (row.customerCode) seenCodes.add(row.customerCode);
        } catch (err) {
          failures.push({
            row: row.row,
            error: err instanceof Error ? err.message.slice(0, 200) : String(err),
          });
        }
      }

      return reply.status(200).send({
        imported: createdIds.length,
        failures,
      });
    },
  });
}
