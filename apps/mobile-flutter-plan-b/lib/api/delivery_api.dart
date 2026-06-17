import 'package:dio/dio.dart';

import '../models/delivery_stop.dart';
import 'client.dart';

/// Wraps the /deliveries + /customers/by-code endpoints.
class DeliveryApi {
  DeliveryApi(this._dio);

  final Dio _dio;

  /// Today's route for the logged-in executive. Returns the date stamp
  /// (so the UI can show "Mon 2 Jun") + the list of stops.
  Future<({String date, String? routeId, List<DeliveryStop> stops})> todaysRoute() {
    return mapApi(() async {
      final res = await _dio.get('/deliveries/today');
      final data = res.data as Map<String, dynamic>;
      final list = (data['deliveries'] as List?) ?? const [];
      final stops = <DeliveryStop>[];
      for (var i = 0; i < list.length; i++) {
        final d = list[i] as Map<String, dynamic>;
        final customer = (d['customer'] ?? {}) as Map<String, dynamic>;
        stops.add(DeliveryStop(
          id: d['id'].toString(),
          customerCode: customer['code']?.toString() ?? '',
          customerName: customer['name']?.toString() ?? 'Customer',
          houseNumber: customer['routeSeq']?.toString() ?? '',
          addressLine: customer['addressLine1']?.toString() ?? '',
          scheduledLitres: _num(d['scheduledLitres']),
          deliveredLitres: d['deliveredLitres'] == null ? null : _num(d['deliveredLitres']),
          sequence: i + 1,
          status: _parseStatus(d['status']?.toString() ?? 'PENDING'),
          scannedAt: d['scannedAt'] == null ? null : DateTime.parse(d['scannedAt'].toString()),
        ));
      }
      return (
        date: data['date']?.toString() ?? '',
        routeId: data['routeId']?.toString(),
        stops: stops,
      );
    });
  }

  /// Confirm a delivery (full or partial qty).
  Future<void> confirm({
    required String deliveryId,
    required double deliveredLitres,
    double? cashCollected,
    String? note,
  }) {
    return mapApi(() async {
      await _dio.post('/deliveries/$deliveryId/confirm', data: {
        'deliveredLitres': deliveredLitres,
        if (cashCollected != null) 'cashCollected': cashCollected,
        if (note != null && note.isNotEmpty) 'note': note,
      });
    });
  }

  /// Skip — customer not home, etc.
  Future<void> skip({
    required String deliveryId,
    String? reason,
  }) {
    return mapApi(() async {
      await _dio.post('/deliveries/$deliveryId/skip', data: {
        if (reason != null && reason.isNotEmpty) 'reason': reason,
      });
    });
  }

  /// Submit the end-of-day report. The backend computes the authoritative
  /// totals (counts, litres, cash collected) from confirmed deliveries +
  /// payments — what the milkman sends is just their tally for variance
  /// reporting, plus optional notes.
  Future<EndOfDayReport> submitEndOfDay({
    double? reportedCashTotal,
    String? notes,
  }) {
    return mapApi(() async {
      final res = await _dio.post('/deliveries/end-of-day', data: {
        if (reportedCashTotal != null) 'reportedCashTotal': reportedCashTotal,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
      });
      final data = res.data as Map<String, dynamic>;
      final counts = (data['counts'] ?? const {}) as Map<String, dynamic>;
      final litres = (data['litres'] ?? const {}) as Map<String, dynamic>;
      final cash = (data['cash'] ?? const {}) as Map<String, dynamic>;
      return EndOfDayReport(
        date: data['date']?.toString() ?? '',
        delivered: (counts['delivered'] as num?)?.toInt() ?? 0,
        partial: (counts['partial'] as num?)?.toInt() ?? 0,
        skipped: (counts['skipped'] as num?)?.toInt() ?? 0,
        pending: (counts['pending'] as num?)?.toInt() ?? 0,
        litresScheduled: _num(litres['scheduled']),
        litresDelivered: _num(litres['delivered']),
        cashCollected: _num(cash['collected']),
        cashReported: cash['reported'] == null ? null : _num(cash['reported']),
        cashVariance: cash['variance'] == null ? null : _num(cash['variance']),
      );
    });
  }

  /// Resolve a scanned QR payload (`JHR-XXXXXX`) → customer summary.
  /// Used by the scanner screen to surface the customer name before
  /// opening the confirm sheet.
  Future<({String id, String code, String name, String addressLine1, double litresPerDay})>
      lookupByCode(String code) {
    return mapApi(() async {
      final res = await _dio.get('/customers/by-code/${Uri.encodeComponent(code)}');
      final data = res.data as Map<String, dynamic>;
      return (
        id: data['id'].toString(),
        code: data['code'].toString(),
        name: data['name'].toString(),
        addressLine1: data['addressLine1']?.toString() ?? '',
        litresPerDay: _num(data['litresPerDay']),
      );
    });
  }
}

DeliveryStatus _parseStatus(String s) {
  switch (s.toUpperCase()) {
    case 'DELIVERED':
      return DeliveryStatus.delivered;
    case 'PARTIAL':
      return DeliveryStatus.partial;
    case 'SKIPPED':
      return DeliveryStatus.skipped;
    default:
      return DeliveryStatus.pending;
  }
}

double _num(dynamic v) {
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v) ?? 0;
  return 0;
}

class EndOfDayReport {
  EndOfDayReport({
    required this.date,
    required this.delivered,
    required this.partial,
    required this.skipped,
    required this.pending,
    required this.litresScheduled,
    required this.litresDelivered,
    required this.cashCollected,
    required this.cashReported,
    required this.cashVariance,
  });

  final String date;
  final int delivered;
  final int partial;
  final int skipped;
  final int pending;
  final double litresScheduled;
  final double litresDelivered;
  final double cashCollected;
  final double? cashReported;
  final double? cashVariance;
}
