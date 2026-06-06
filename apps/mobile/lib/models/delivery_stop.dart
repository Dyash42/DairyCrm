/// One customer stop on the milkman's route today.
///
/// Mirrors the Delivery entity on the backend (apps/backend/prisma/schema.prisma).

enum DeliveryStatus { pending, delivered, partial, skipped }

class DeliveryStop {
  const DeliveryStop({
    required this.id,
    required this.customerCode,
    required this.customerName,
    required this.houseNumber,
    required this.addressLine,
    required this.scheduledLitres,
    required this.sequence,
    this.deliveredLitres,
    this.status = DeliveryStatus.pending,
    this.scannedAt,
  });

  final String id;
  final String customerCode; // e.g. JHR-100455
  final String customerName;
  final String houseNumber; // e.g. MIG-12, Plot 4
  final String addressLine;
  final double scheduledLitres;
  final double? deliveredLitres;
  final int sequence; // 1, 2, 3 ...
  final DeliveryStatus status;
  final DateTime? scannedAt;

  bool get isDelivered =>
      status == DeliveryStatus.delivered || status == DeliveryStatus.partial;

  bool get isPartial =>
      status == DeliveryStatus.partial &&
      deliveredLitres != null &&
      deliveredLitres! < scheduledLitres;

  bool get isPending => status == DeliveryStatus.pending;

  bool get isSkipped => status == DeliveryStatus.skipped;

  DeliveryStop copyWith({
    DeliveryStatus? status,
    double? deliveredLitres,
    DateTime? scannedAt,
  }) {
    return DeliveryStop(
      id: id,
      customerCode: customerCode,
      customerName: customerName,
      houseNumber: houseNumber,
      addressLine: addressLine,
      scheduledLitres: scheduledLitres,
      deliveredLitres: deliveredLitres ?? this.deliveredLitres,
      sequence: sequence,
      status: status ?? this.status,
      scannedAt: scannedAt ?? this.scannedAt,
    );
  }
}

class RouteSummary {
  const RouteSummary({
    required this.executiveName,
    required this.dateLabel,
    required this.routeLabel,
    required this.stops,
  });

  final String executiveName;
  final String dateLabel; // "Mon 2 Jun"
  final String routeLabel; // "Route 4 — Berhampur South"
  final List<DeliveryStop> stops;

  int get totalCustomers => stops.length;
  int get servedCount => stops.where((s) => s.isDelivered).length;
  int get pendingCount => stops.where((s) => s.isPending).length;
  int get skippedCount => stops.where((s) => s.isSkipped).length;

  double get litresScheduledTotal =>
      stops.fold<double>(0, (a, s) => a + s.scheduledLitres);

  double get litresDeliveredTotal => stops.fold<double>(0, (a, s) {
    if (!s.isDelivered) return a;
    return a + (s.deliveredLitres ?? s.scheduledLitres);
  });

  /// L still owed today (scheduled - delivered, ignoring skipped).
  double get litresLeft {
    double remaining = 0;
    for (final s in stops) {
      if (s.isSkipped) continue; // skipped is not "left"
      if (s.isDelivered) continue;
      remaining += s.scheduledLitres;
    }
    return remaining;
  }

  /// Completion % across non-skipped stops.
  int get completionPct {
    final actionable = stops.where((s) => !s.isSkipped).length;
    if (actionable == 0) return 100;
    final done = stops.where((s) => s.isDelivered).length;
    return ((done / actionable) * 100).round();
  }

  bool get isComplete => pendingCount == 0;

  /// Approx amount to collect — uses ₹64/L from the WhatsApp bot PDF.
  /// In production this comes from the backend (per-customer rate × delivered).
  int get amountToCollect {
    const ratePerLitre = 64;
    return (litresDeliveredTotal * ratePerLitre).round();
  }
}
