/**
 * Offline scan queue on expo-sqlite. Port of the Flutter app's drift
 * database (storage/database.dart). The queue holds delivery confirmations
 * captured while offline; the sync engine drains it when connectivity
 * returns. Server-side idempotency (Delivery row keyed by id) makes a
 * duplicate push safe.
 */
import { Platform } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';

/** Status of a scan in the offline queue. Stored as an int to mirror the
 *  Flutter drift enum ordering. */
export enum QueuedScanStatus {
  pending = 0,
  syncing = 1,
  pushed = 2,
  failed = 3,
}

export interface QueuedScan {
  id: number;
  deliveryId: string;
  customerCode: string;
  deliveredLitres: number;
  cashCollected: number | null;
  note: string | null;
  kind: string; // 'DELIVERED' | 'PARTIAL' | 'SKIPPED'
  scannedAt: string; // ISO
  status: QueuedScanStatus;
  attempts: number;
  lastError: string | null;
  updatedAt: string; // ISO
  /** Owning executive (user id). Rows only drain under that user's token so a
   *  shared device / re-login can't push one milkman's scans as another. */
  executiveId: string | null;
}

interface Row {
  id: number;
  delivery_id: string;
  customer_code: string;
  delivered_litres: number;
  cash_collected: number | null;
  note: string | null;
  kind: string;
  scanned_at: string;
  status: number;
  attempts: number;
  last_error: string | null;
  updated_at: string;
  executive_id: string | null;
}

const DB_NAME = 'jharanai_offline.db';

let dbPromise: Promise<SQLiteDatabase> | null = null;

async function getDb(): Promise<SQLiteDatabase> {
  // expo-sqlite has no web native module — it throws `requireNativeModule
  // ('ExpoSQLite')` even at import time. We import it lazily and only on
  // native so the web preview boots; the offline queue is simply disabled
  // on web (callers are wrapped / the screens that use it need a device).
  if (Platform.OS === 'web') {
    throw new Error('SQLite offline queue is not available on web');
  }
  if (!dbPromise) {
    dbPromise = (async () => {
      const SQLite = await import('expo-sqlite');
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS queued_scans (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          delivery_id TEXT NOT NULL,
          customer_code TEXT NOT NULL,
          delivered_litres REAL NOT NULL,
          cash_collected REAL,
          note TEXT,
          kind TEXT NOT NULL,
          scanned_at TEXT NOT NULL,
          status INTEGER NOT NULL DEFAULT 0,
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          updated_at TEXT NOT NULL,
          executive_id TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_queued_scans_status
          ON queued_scans (status, scanned_at);
      `);
      // Migrate installs that predate executive_id (audit MOB-03). ALTER throws
      // "duplicate column" once the column exists — swallow on re-boot.
      try {
        await db.execAsync(`ALTER TABLE queued_scans ADD COLUMN executive_id TEXT`);
      } catch {
        // column already present
      }
      return db;
    })();
  }
  return dbPromise;
}

function mapRow(r: Row): QueuedScan {
  return {
    id: r.id,
    deliveryId: r.delivery_id,
    customerCode: r.customer_code,
    deliveredLitres: r.delivered_litres,
    cashCollected: r.cash_collected ?? null,
    note: r.note ?? null,
    kind: r.kind,
    scannedAt: r.scanned_at,
    status: r.status as QueuedScanStatus,
    attempts: r.attempts,
    lastError: r.last_error ?? null,
    updatedAt: r.updated_at,
    executiveId: r.executive_id ?? null,
  };
}

/** Match rows owned by `executiveId` OR legacy untagged rows (executive_id IS
 *  NULL, written before the MOB-03 fix) so nothing is permanently stranded. */
const OWNER_CLAUSE = '(executive_id = ? OR executive_id IS NULL)';

export const db = {
  async init(): Promise<void> {
    await getDb();
  },

  /** Insert a brand-new scan into the queue. Returns the new row id. */
  async enqueue(params: {
    deliveryId: string;
    customerCode: string;
    deliveredLitres: number;
    cashCollected?: number | null;
    note?: string | null;
    kind: string;
    executiveId?: string | null;
  }): Promise<number> {
    const conn = await getDb();
    const now = new Date().toISOString();
    const res = await conn.runAsync(
      `INSERT INTO queued_scans
        (delivery_id, customer_code, delivered_litres, cash_collected, note, kind, scanned_at, status, attempts, updated_at, executive_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      params.deliveryId,
      params.customerCode,
      params.deliveredLitres,
      params.cashCollected ?? null,
      params.note ?? null,
      params.kind,
      now,
      QueuedScanStatus.pending,
      now,
      params.executiveId ?? null,
    );
    return res.lastInsertRowId;
  },

  async countPending(executiveId: string | null): Promise<number> {
    const conn = await getDb();
    const row = await conn.getFirstAsync<{ c: number }>(
      `SELECT COUNT(*) AS c FROM queued_scans WHERE status = ? AND ${OWNER_CLAUSE}`,
      QueuedScanStatus.pending,
      executiveId,
    );
    return row?.c ?? 0;
  },

  /** Count rows parked as permanently failed (need manual attention). */
  async countFailed(executiveId: string | null): Promise<number> {
    const conn = await getDb();
    const row = await conn.getFirstAsync<{ c: number }>(
      `SELECT COUNT(*) AS c FROM queued_scans WHERE status = ? AND ${OWNER_CLAUSE}`,
      QueuedScanStatus.failed,
      executiveId,
    );
    return row?.c ?? 0;
  },

  /** Pending scans for this executive, oldest first, limited. */
  async takeNext(limit: number, executiveId: string | null): Promise<QueuedScan[]> {
    const conn = await getDb();
    const rows = await conn.getAllAsync<Row>(
      `SELECT * FROM queued_scans WHERE status = ? AND ${OWNER_CLAUSE} ORDER BY scanned_at ASC LIMIT ?`,
      QueuedScanStatus.pending,
      executiveId,
      limit,
    );
    return rows.map(mapRow);
  },

  async markSyncing(id: number): Promise<void> {
    const conn = await getDb();
    await conn.runAsync(
      `UPDATE queued_scans SET status = ?, updated_at = ? WHERE id = ?`,
      QueuedScanStatus.syncing,
      new Date().toISOString(),
      id,
    );
  },

  async markPushed(id: number): Promise<void> {
    const conn = await getDb();
    await conn.runAsync(
      `UPDATE queued_scans SET status = ?, updated_at = ? WHERE id = ?`,
      QueuedScanStatus.pushed,
      new Date().toISOString(),
      id,
    );
  },

  async markFailed(id: number, error: string): Promise<void> {
    const conn = await getDb();
    await conn.runAsync(
      `UPDATE queued_scans SET status = ?, last_error = ?, updated_at = ? WHERE id = ?`,
      QueuedScanStatus.failed,
      error,
      new Date().toISOString(),
      id,
    );
  },

  /** Bump the attempt counter and return the row to pending so it retries. */
  async bumpAttempt(id: number, error: string | null): Promise<void> {
    const conn = await getDb();
    await conn.runAsync(
      `UPDATE queued_scans
         SET status = ?, attempts = attempts + 1, last_error = ?, updated_at = ?
       WHERE id = ?`,
      QueuedScanStatus.pending,
      error,
      new Date().toISOString(),
      id,
    );
  },
};
