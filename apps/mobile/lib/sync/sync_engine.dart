import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/delivery_api.dart';
import '../api/error.dart';
import '../state/route_provider.dart';
import '../storage/database.dart';
import 'connectivity.dart';

enum SyncStatus { idle, syncing, allClear, error }

class SyncState {
  const SyncState({
    required this.status,
    required this.queueDepth,
    this.lastError,
  });

  final SyncStatus status;
  final int queueDepth;
  final String? lastError;

  static const initial = SyncState(status: SyncStatus.idle, queueDepth: 0);

  SyncState copyWith({SyncStatus? status, int? queueDepth, String? lastError}) =>
      SyncState(
        status: status ?? this.status,
        queueDepth: queueDepth ?? this.queueDepth,
        lastError: lastError,
      );
}

/// Watches connectivity + the offline queue and drains the queue when
/// network returns. Owns no UI state; it only mutates the DB and reports
/// its current status.
///
/// Failure handling:
///   - First failure → mark `failed` + lastError + bumpAttempt (status
///     stays pending so we'll try again next online tick)
///   - We do NOT pop from the queue until the server returns 2xx.
class SyncEngine extends StateNotifier<SyncState> {
  SyncEngine(this._ref) : super(SyncState.initial) {
    _subscribe();
    _refreshQueueDepth();
  }

  final Ref _ref;
  StreamSubscription<bool>? _connectivitySub;

  AppDatabase get _db => _ref.read(appDatabaseProvider);
  DeliveryApi get _api => _ref.read(deliveryApiProvider);

  void _subscribe() {
    final stream = _ref.read(connectivityStreamProvider.stream);
    _connectivitySub = stream.listen((online) {
      if (online) _drain();
    });
  }

  Future<void> _refreshQueueDepth() async {
    final n = await _db.countPending();
    state = state.copyWith(queueDepth: n);
    _ref.read(queuedScanCountProvider.notifier).state = n;
  }

  /// Push pending scans one at a time. Stops on first failure for the
  /// current pass (next online event retries). Idempotency on the server
  /// (Delivery row keyed by id) makes a duplicate push safe.
  Future<void> _drain() async {
    if (state.status == SyncStatus.syncing) return;
    state = state.copyWith(status: SyncStatus.syncing);
    while (true) {
      final batch = await _db.takeNext(1);
      if (batch.isEmpty) break;
      final row = batch.first;
      await _db.markSyncing(row.id);
      try {
        if (row.kind == 'SKIPPED') {
          await _api.skip(deliveryId: row.deliveryId, reason: row.note);
        } else {
          await _api.confirm(
            deliveryId: row.deliveryId,
            deliveredLitres: row.deliveredLitres,
            cashCollected: row.cashCollected,
            note: row.note,
          );
        }
        await _db.markPushed(row.id);
      } on ApiException catch (e) {
        await _db.bumpAttempt(row.id, e.message);
        state = state.copyWith(status: SyncStatus.error, lastError: e.message);
        await _refreshQueueDepth();
        return;
      } catch (e) {
        await _db.bumpAttempt(row.id, e.toString());
        state = state.copyWith(status: SyncStatus.error, lastError: e.toString());
        await _refreshQueueDepth();
        return;
      }
    }
    await _refreshQueueDepth();
    state = state.copyWith(status: SyncStatus.allClear);
  }

  /// Public API for the confirm sheet — record the scan locally and try
  /// pushing immediately if online.
  Future<void> recordScan({
    required String deliveryId,
    required String customerCode,
    required double deliveredLitres,
    double? cashCollected,
    String? note,
    String kind = 'DELIVERED',
  }) async {
    await _db.enqueue(
      deliveryId: deliveryId,
      customerCode: customerCode,
      deliveredLitres: deliveredLitres,
      cashCollected: cashCollected,
      note: note,
      kind: kind,
    );
    await _refreshQueueDepth();
    final offline = _ref.read(isOfflineStreamProvider);
    if (!offline) {
      // Fire and forget — let it run in the background.
      // ignore: discarded_futures
      _drain();
    }
  }

  @override
  void dispose() {
    _connectivitySub?.cancel();
    super.dispose();
  }
}

final syncEngineProvider = StateNotifierProvider<SyncEngine, SyncState>(
  (ref) => SyncEngine(ref),
);
