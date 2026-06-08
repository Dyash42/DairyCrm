// ignore_for_file: invalid_annotation_target
//
// IMPORTANT: this file uses generated code (database.g.dart) which is
// produced by:
//
//     dart run build_runner build
//
// Run that command once after `flutter pub get`. If you see a missing
// `_$AppDatabase` error, you forgot the codegen step.

import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

part 'database.g.dart';

/// Status of a scan in the offline queue. Mirrors the backend's
/// DeliveryStatus enum (PENDING is implicit — the row exists because it
/// hasn't pushed yet).
enum QueuedScanStatus { pending, syncing, pushed, failed }

class QueuedScans extends Table {
  IntColumn get id => integer().autoIncrement()();
  /// The backend Delivery row id this scan refers to.
  TextColumn get deliveryId => text()();
  TextColumn get customerCode => text()();
  RealColumn get deliveredLitres => real()();
  RealColumn get cashCollected => real().nullable()();
  TextColumn get note => text().nullable()();
  /// 'DELIVERED' | 'PARTIAL' | 'SKIPPED' — what action to push.
  TextColumn get kind => text()();
  DateTimeColumn get scannedAt => dateTime()();
  IntColumn get status => intEnum<QueuedScanStatus>()
      .withDefault(const Constant(0))();
  IntColumn get attempts => integer().withDefault(const Constant(0))();
  TextColumn get lastError => text().nullable()();
  DateTimeColumn get updatedAt =>
      dateTime().clientDefault(() => DateTime.now())();

  // No explicit primaryKey override — Drift treats autoIncrement() as the
  // primary key automatically, and declaring both is a "can't override
  // primaryKey and use autoIncrement" error from drift_dev.
}

@DriftDatabase(tables: [QueuedScans])
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(_open());

  @override
  int get schemaVersion => 1;

  /// Insert a brand-new scan into the queue.
  Future<int> enqueue({
    required String deliveryId,
    required String customerCode,
    required double deliveredLitres,
    double? cashCollected,
    String? note,
    required String kind,
  }) {
    return into(queuedScans).insert(QueuedScansCompanion.insert(
      deliveryId: deliveryId,
      customerCode: customerCode,
      deliveredLitres: deliveredLitres,
      cashCollected: Value(cashCollected),
      note: Value(note),
      kind: kind,
      scannedAt: DateTime.now(),
    ));
  }

  /// Pending scans, oldest first.
  Stream<List<QueuedScan>> watchPending() {
    return (select(queuedScans)
          ..where((t) => t.status.equals(QueuedScanStatus.pending.index))
          ..orderBy([(t) => OrderingTerm.asc(t.scannedAt)]))
        .watch();
  }

  Future<int> countPending() async {
    final rows = await (select(queuedScans)
          ..where((t) => t.status.equals(QueuedScanStatus.pending.index)))
        .get();
    return rows.length;
  }

  Future<List<QueuedScan>> takeNext(int limit) {
    return (select(queuedScans)
          ..where((t) => t.status.equals(QueuedScanStatus.pending.index))
          ..orderBy([(t) => OrderingTerm.asc(t.scannedAt)])
          ..limit(limit))
        .get();
  }

  Future<void> markSyncing(int id) {
    return (update(queuedScans)..where((t) => t.id.equals(id))).write(
      QueuedScansCompanion(
        status: Value(QueuedScanStatus.syncing),
        updatedAt: Value(DateTime.now()),
      ),
    );
  }

  Future<void> markPushed(int id) {
    return (update(queuedScans)..where((t) => t.id.equals(id))).write(
      QueuedScansCompanion(
        status: Value(QueuedScanStatus.pushed),
        updatedAt: Value(DateTime.now()),
      ),
    );
  }

  Future<void> markFailed(int id, String error) {
    return (update(queuedScans)..where((t) => t.id.equals(id))).write(
      QueuedScansCompanion(
        status: Value(QueuedScanStatus.failed),
        attempts: const Value.absent(),
        lastError: Value(error),
        updatedAt: Value(DateTime.now()),
      ),
    );
  }

  Future<void> bumpAttempt(int id, String? error) async {
    final row = await (select(queuedScans)..where((t) => t.id.equals(id)))
        .getSingleOrNull();
    if (row == null) return;
    await (update(queuedScans)..where((t) => t.id.equals(id))).write(
      QueuedScansCompanion(
        status: const Value(QueuedScanStatus.pending),
        attempts: Value(row.attempts + 1),
        lastError: Value(error),
        updatedAt: Value(DateTime.now()),
      ),
    );
  }
}

LazyDatabase _open() {
  return LazyDatabase(() async {
    final dir = await getApplicationDocumentsDirectory();
    final file = File(p.join(dir.path, 'jharanai_offline.sqlite'));
    return NativeDatabase.createInBackground(file);
  });
}

final appDatabaseProvider = Provider<AppDatabase>((ref) {
  final db = AppDatabase();
  ref.onDispose(db.close);
  return db;
});
