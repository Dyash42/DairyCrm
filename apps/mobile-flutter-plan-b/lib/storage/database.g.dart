// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'database.dart';

// ignore_for_file: type=lint
class $QueuedScansTable extends QueuedScans
    with TableInfo<$QueuedScansTable, QueuedScan> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $QueuedScansTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<int> id = GeneratedColumn<int>(
      'id', aliasedName, false,
      hasAutoIncrement: true,
      type: DriftSqlType.int,
      requiredDuringInsert: false,
      defaultConstraints:
          GeneratedColumn.constraintIsAlways('PRIMARY KEY AUTOINCREMENT'));
  static const VerificationMeta _deliveryIdMeta =
      const VerificationMeta('deliveryId');
  @override
  late final GeneratedColumn<String> deliveryId = GeneratedColumn<String>(
      'delivery_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _customerCodeMeta =
      const VerificationMeta('customerCode');
  @override
  late final GeneratedColumn<String> customerCode = GeneratedColumn<String>(
      'customer_code', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _deliveredLitresMeta =
      const VerificationMeta('deliveredLitres');
  @override
  late final GeneratedColumn<double> deliveredLitres = GeneratedColumn<double>(
      'delivered_litres', aliasedName, false,
      type: DriftSqlType.double, requiredDuringInsert: true);
  static const VerificationMeta _cashCollectedMeta =
      const VerificationMeta('cashCollected');
  @override
  late final GeneratedColumn<double> cashCollected = GeneratedColumn<double>(
      'cash_collected', aliasedName, true,
      type: DriftSqlType.double, requiredDuringInsert: false);
  static const VerificationMeta _noteMeta = const VerificationMeta('note');
  @override
  late final GeneratedColumn<String> note = GeneratedColumn<String>(
      'note', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _kindMeta = const VerificationMeta('kind');
  @override
  late final GeneratedColumn<String> kind = GeneratedColumn<String>(
      'kind', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _scannedAtMeta =
      const VerificationMeta('scannedAt');
  @override
  late final GeneratedColumn<DateTime> scannedAt = GeneratedColumn<DateTime>(
      'scanned_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  @override
  late final GeneratedColumnWithTypeConverter<QueuedScanStatus, int> status =
      GeneratedColumn<int>('status', aliasedName, false,
              type: DriftSqlType.int,
              requiredDuringInsert: false,
              defaultValue: const Constant(0))
          .withConverter<QueuedScanStatus>($QueuedScansTable.$converterstatus);
  static const VerificationMeta _attemptsMeta =
      const VerificationMeta('attempts');
  @override
  late final GeneratedColumn<int> attempts = GeneratedColumn<int>(
      'attempts', aliasedName, false,
      type: DriftSqlType.int,
      requiredDuringInsert: false,
      defaultValue: const Constant(0));
  static const VerificationMeta _lastErrorMeta =
      const VerificationMeta('lastError');
  @override
  late final GeneratedColumn<String> lastError = GeneratedColumn<String>(
      'last_error', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _updatedAtMeta =
      const VerificationMeta('updatedAt');
  @override
  late final GeneratedColumn<DateTime> updatedAt = GeneratedColumn<DateTime>(
      'updated_at', aliasedName, false,
      type: DriftSqlType.dateTime,
      requiredDuringInsert: false,
      clientDefault: () => DateTime.now());
  @override
  List<GeneratedColumn> get $columns => [
        id,
        deliveryId,
        customerCode,
        deliveredLitres,
        cashCollected,
        note,
        kind,
        scannedAt,
        status,
        attempts,
        lastError,
        updatedAt
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'queued_scans';
  @override
  VerificationContext validateIntegrity(Insertable<QueuedScan> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    }
    if (data.containsKey('delivery_id')) {
      context.handle(
          _deliveryIdMeta,
          deliveryId.isAcceptableOrUnknown(
              data['delivery_id']!, _deliveryIdMeta));
    } else if (isInserting) {
      context.missing(_deliveryIdMeta);
    }
    if (data.containsKey('customer_code')) {
      context.handle(
          _customerCodeMeta,
          customerCode.isAcceptableOrUnknown(
              data['customer_code']!, _customerCodeMeta));
    } else if (isInserting) {
      context.missing(_customerCodeMeta);
    }
    if (data.containsKey('delivered_litres')) {
      context.handle(
          _deliveredLitresMeta,
          deliveredLitres.isAcceptableOrUnknown(
              data['delivered_litres']!, _deliveredLitresMeta));
    } else if (isInserting) {
      context.missing(_deliveredLitresMeta);
    }
    if (data.containsKey('cash_collected')) {
      context.handle(
          _cashCollectedMeta,
          cashCollected.isAcceptableOrUnknown(
              data['cash_collected']!, _cashCollectedMeta));
    }
    if (data.containsKey('note')) {
      context.handle(
          _noteMeta, note.isAcceptableOrUnknown(data['note']!, _noteMeta));
    }
    if (data.containsKey('kind')) {
      context.handle(
          _kindMeta, kind.isAcceptableOrUnknown(data['kind']!, _kindMeta));
    } else if (isInserting) {
      context.missing(_kindMeta);
    }
    if (data.containsKey('scanned_at')) {
      context.handle(_scannedAtMeta,
          scannedAt.isAcceptableOrUnknown(data['scanned_at']!, _scannedAtMeta));
    } else if (isInserting) {
      context.missing(_scannedAtMeta);
    }
    context.handle(_statusMeta, const VerificationResult.success());
    if (data.containsKey('attempts')) {
      context.handle(_attemptsMeta,
          attempts.isAcceptableOrUnknown(data['attempts']!, _attemptsMeta));
    }
    if (data.containsKey('last_error')) {
      context.handle(_lastErrorMeta,
          lastError.isAcceptableOrUnknown(data['last_error']!, _lastErrorMeta));
    }
    if (data.containsKey('updated_at')) {
      context.handle(_updatedAtMeta,
          updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta));
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  QueuedScan map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return QueuedScan(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}id'])!,
      deliveryId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}delivery_id'])!,
      customerCode: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}customer_code'])!,
      deliveredLitres: attachedDatabase.typeMapping.read(
          DriftSqlType.double, data['${effectivePrefix}delivered_litres'])!,
      cashCollected: attachedDatabase.typeMapping
          .read(DriftSqlType.double, data['${effectivePrefix}cash_collected']),
      note: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}note']),
      kind: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}kind'])!,
      scannedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}scanned_at'])!,
      status: $QueuedScansTable.$converterstatus.fromSql(attachedDatabase
          .typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}status'])!),
      attempts: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}attempts'])!,
      lastError: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}last_error']),
      updatedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}updated_at'])!,
    );
  }

  @override
  $QueuedScansTable createAlias(String alias) {
    return $QueuedScansTable(attachedDatabase, alias);
  }

  static JsonTypeConverter2<QueuedScanStatus, int, int> $converterstatus =
      const EnumIndexConverter<QueuedScanStatus>(QueuedScanStatus.values);
}

class QueuedScan extends DataClass implements Insertable<QueuedScan> {
  final int id;

  /// The backend Delivery row id this scan refers to.
  final String deliveryId;
  final String customerCode;
  final double deliveredLitres;
  final double? cashCollected;
  final String? note;

  /// 'DELIVERED' | 'PARTIAL' | 'SKIPPED' — what action to push.
  final String kind;
  final DateTime scannedAt;
  final QueuedScanStatus status;
  final int attempts;
  final String? lastError;
  final DateTime updatedAt;
  const QueuedScan(
      {required this.id,
      required this.deliveryId,
      required this.customerCode,
      required this.deliveredLitres,
      this.cashCollected,
      this.note,
      required this.kind,
      required this.scannedAt,
      required this.status,
      required this.attempts,
      this.lastError,
      required this.updatedAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['delivery_id'] = Variable<String>(deliveryId);
    map['customer_code'] = Variable<String>(customerCode);
    map['delivered_litres'] = Variable<double>(deliveredLitres);
    if (!nullToAbsent || cashCollected != null) {
      map['cash_collected'] = Variable<double>(cashCollected);
    }
    if (!nullToAbsent || note != null) {
      map['note'] = Variable<String>(note);
    }
    map['kind'] = Variable<String>(kind);
    map['scanned_at'] = Variable<DateTime>(scannedAt);
    {
      map['status'] =
          Variable<int>($QueuedScansTable.$converterstatus.toSql(status));
    }
    map['attempts'] = Variable<int>(attempts);
    if (!nullToAbsent || lastError != null) {
      map['last_error'] = Variable<String>(lastError);
    }
    map['updated_at'] = Variable<DateTime>(updatedAt);
    return map;
  }

  QueuedScansCompanion toCompanion(bool nullToAbsent) {
    return QueuedScansCompanion(
      id: Value(id),
      deliveryId: Value(deliveryId),
      customerCode: Value(customerCode),
      deliveredLitres: Value(deliveredLitres),
      cashCollected: cashCollected == null && nullToAbsent
          ? const Value.absent()
          : Value(cashCollected),
      note: note == null && nullToAbsent ? const Value.absent() : Value(note),
      kind: Value(kind),
      scannedAt: Value(scannedAt),
      status: Value(status),
      attempts: Value(attempts),
      lastError: lastError == null && nullToAbsent
          ? const Value.absent()
          : Value(lastError),
      updatedAt: Value(updatedAt),
    );
  }

  factory QueuedScan.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return QueuedScan(
      id: serializer.fromJson<int>(json['id']),
      deliveryId: serializer.fromJson<String>(json['deliveryId']),
      customerCode: serializer.fromJson<String>(json['customerCode']),
      deliveredLitres: serializer.fromJson<double>(json['deliveredLitres']),
      cashCollected: serializer.fromJson<double?>(json['cashCollected']),
      note: serializer.fromJson<String?>(json['note']),
      kind: serializer.fromJson<String>(json['kind']),
      scannedAt: serializer.fromJson<DateTime>(json['scannedAt']),
      status: $QueuedScansTable.$converterstatus
          .fromJson(serializer.fromJson<int>(json['status'])),
      attempts: serializer.fromJson<int>(json['attempts']),
      lastError: serializer.fromJson<String?>(json['lastError']),
      updatedAt: serializer.fromJson<DateTime>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'deliveryId': serializer.toJson<String>(deliveryId),
      'customerCode': serializer.toJson<String>(customerCode),
      'deliveredLitres': serializer.toJson<double>(deliveredLitres),
      'cashCollected': serializer.toJson<double?>(cashCollected),
      'note': serializer.toJson<String?>(note),
      'kind': serializer.toJson<String>(kind),
      'scannedAt': serializer.toJson<DateTime>(scannedAt),
      'status': serializer
          .toJson<int>($QueuedScansTable.$converterstatus.toJson(status)),
      'attempts': serializer.toJson<int>(attempts),
      'lastError': serializer.toJson<String?>(lastError),
      'updatedAt': serializer.toJson<DateTime>(updatedAt),
    };
  }

  QueuedScan copyWith(
          {int? id,
          String? deliveryId,
          String? customerCode,
          double? deliveredLitres,
          Value<double?> cashCollected = const Value.absent(),
          Value<String?> note = const Value.absent(),
          String? kind,
          DateTime? scannedAt,
          QueuedScanStatus? status,
          int? attempts,
          Value<String?> lastError = const Value.absent(),
          DateTime? updatedAt}) =>
      QueuedScan(
        id: id ?? this.id,
        deliveryId: deliveryId ?? this.deliveryId,
        customerCode: customerCode ?? this.customerCode,
        deliveredLitres: deliveredLitres ?? this.deliveredLitres,
        cashCollected:
            cashCollected.present ? cashCollected.value : this.cashCollected,
        note: note.present ? note.value : this.note,
        kind: kind ?? this.kind,
        scannedAt: scannedAt ?? this.scannedAt,
        status: status ?? this.status,
        attempts: attempts ?? this.attempts,
        lastError: lastError.present ? lastError.value : this.lastError,
        updatedAt: updatedAt ?? this.updatedAt,
      );
  QueuedScan copyWithCompanion(QueuedScansCompanion data) {
    return QueuedScan(
      id: data.id.present ? data.id.value : this.id,
      deliveryId:
          data.deliveryId.present ? data.deliveryId.value : this.deliveryId,
      customerCode: data.customerCode.present
          ? data.customerCode.value
          : this.customerCode,
      deliveredLitres: data.deliveredLitres.present
          ? data.deliveredLitres.value
          : this.deliveredLitres,
      cashCollected: data.cashCollected.present
          ? data.cashCollected.value
          : this.cashCollected,
      note: data.note.present ? data.note.value : this.note,
      kind: data.kind.present ? data.kind.value : this.kind,
      scannedAt: data.scannedAt.present ? data.scannedAt.value : this.scannedAt,
      status: data.status.present ? data.status.value : this.status,
      attempts: data.attempts.present ? data.attempts.value : this.attempts,
      lastError: data.lastError.present ? data.lastError.value : this.lastError,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('QueuedScan(')
          ..write('id: $id, ')
          ..write('deliveryId: $deliveryId, ')
          ..write('customerCode: $customerCode, ')
          ..write('deliveredLitres: $deliveredLitres, ')
          ..write('cashCollected: $cashCollected, ')
          ..write('note: $note, ')
          ..write('kind: $kind, ')
          ..write('scannedAt: $scannedAt, ')
          ..write('status: $status, ')
          ..write('attempts: $attempts, ')
          ..write('lastError: $lastError, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
      id,
      deliveryId,
      customerCode,
      deliveredLitres,
      cashCollected,
      note,
      kind,
      scannedAt,
      status,
      attempts,
      lastError,
      updatedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is QueuedScan &&
          other.id == this.id &&
          other.deliveryId == this.deliveryId &&
          other.customerCode == this.customerCode &&
          other.deliveredLitres == this.deliveredLitres &&
          other.cashCollected == this.cashCollected &&
          other.note == this.note &&
          other.kind == this.kind &&
          other.scannedAt == this.scannedAt &&
          other.status == this.status &&
          other.attempts == this.attempts &&
          other.lastError == this.lastError &&
          other.updatedAt == this.updatedAt);
}

class QueuedScansCompanion extends UpdateCompanion<QueuedScan> {
  final Value<int> id;
  final Value<String> deliveryId;
  final Value<String> customerCode;
  final Value<double> deliveredLitres;
  final Value<double?> cashCollected;
  final Value<String?> note;
  final Value<String> kind;
  final Value<DateTime> scannedAt;
  final Value<QueuedScanStatus> status;
  final Value<int> attempts;
  final Value<String?> lastError;
  final Value<DateTime> updatedAt;
  const QueuedScansCompanion({
    this.id = const Value.absent(),
    this.deliveryId = const Value.absent(),
    this.customerCode = const Value.absent(),
    this.deliveredLitres = const Value.absent(),
    this.cashCollected = const Value.absent(),
    this.note = const Value.absent(),
    this.kind = const Value.absent(),
    this.scannedAt = const Value.absent(),
    this.status = const Value.absent(),
    this.attempts = const Value.absent(),
    this.lastError = const Value.absent(),
    this.updatedAt = const Value.absent(),
  });
  QueuedScansCompanion.insert({
    this.id = const Value.absent(),
    required String deliveryId,
    required String customerCode,
    required double deliveredLitres,
    this.cashCollected = const Value.absent(),
    this.note = const Value.absent(),
    required String kind,
    required DateTime scannedAt,
    this.status = const Value.absent(),
    this.attempts = const Value.absent(),
    this.lastError = const Value.absent(),
    this.updatedAt = const Value.absent(),
  })  : deliveryId = Value(deliveryId),
        customerCode = Value(customerCode),
        deliveredLitres = Value(deliveredLitres),
        kind = Value(kind),
        scannedAt = Value(scannedAt);
  static Insertable<QueuedScan> custom({
    Expression<int>? id,
    Expression<String>? deliveryId,
    Expression<String>? customerCode,
    Expression<double>? deliveredLitres,
    Expression<double>? cashCollected,
    Expression<String>? note,
    Expression<String>? kind,
    Expression<DateTime>? scannedAt,
    Expression<int>? status,
    Expression<int>? attempts,
    Expression<String>? lastError,
    Expression<DateTime>? updatedAt,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (deliveryId != null) 'delivery_id': deliveryId,
      if (customerCode != null) 'customer_code': customerCode,
      if (deliveredLitres != null) 'delivered_litres': deliveredLitres,
      if (cashCollected != null) 'cash_collected': cashCollected,
      if (note != null) 'note': note,
      if (kind != null) 'kind': kind,
      if (scannedAt != null) 'scanned_at': scannedAt,
      if (status != null) 'status': status,
      if (attempts != null) 'attempts': attempts,
      if (lastError != null) 'last_error': lastError,
      if (updatedAt != null) 'updated_at': updatedAt,
    });
  }

  QueuedScansCompanion copyWith(
      {Value<int>? id,
      Value<String>? deliveryId,
      Value<String>? customerCode,
      Value<double>? deliveredLitres,
      Value<double?>? cashCollected,
      Value<String?>? note,
      Value<String>? kind,
      Value<DateTime>? scannedAt,
      Value<QueuedScanStatus>? status,
      Value<int>? attempts,
      Value<String?>? lastError,
      Value<DateTime>? updatedAt}) {
    return QueuedScansCompanion(
      id: id ?? this.id,
      deliveryId: deliveryId ?? this.deliveryId,
      customerCode: customerCode ?? this.customerCode,
      deliveredLitres: deliveredLitres ?? this.deliveredLitres,
      cashCollected: cashCollected ?? this.cashCollected,
      note: note ?? this.note,
      kind: kind ?? this.kind,
      scannedAt: scannedAt ?? this.scannedAt,
      status: status ?? this.status,
      attempts: attempts ?? this.attempts,
      lastError: lastError ?? this.lastError,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<int>(id.value);
    }
    if (deliveryId.present) {
      map['delivery_id'] = Variable<String>(deliveryId.value);
    }
    if (customerCode.present) {
      map['customer_code'] = Variable<String>(customerCode.value);
    }
    if (deliveredLitres.present) {
      map['delivered_litres'] = Variable<double>(deliveredLitres.value);
    }
    if (cashCollected.present) {
      map['cash_collected'] = Variable<double>(cashCollected.value);
    }
    if (note.present) {
      map['note'] = Variable<String>(note.value);
    }
    if (kind.present) {
      map['kind'] = Variable<String>(kind.value);
    }
    if (scannedAt.present) {
      map['scanned_at'] = Variable<DateTime>(scannedAt.value);
    }
    if (status.present) {
      map['status'] =
          Variable<int>($QueuedScansTable.$converterstatus.toSql(status.value));
    }
    if (attempts.present) {
      map['attempts'] = Variable<int>(attempts.value);
    }
    if (lastError.present) {
      map['last_error'] = Variable<String>(lastError.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<DateTime>(updatedAt.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('QueuedScansCompanion(')
          ..write('id: $id, ')
          ..write('deliveryId: $deliveryId, ')
          ..write('customerCode: $customerCode, ')
          ..write('deliveredLitres: $deliveredLitres, ')
          ..write('cashCollected: $cashCollected, ')
          ..write('note: $note, ')
          ..write('kind: $kind, ')
          ..write('scannedAt: $scannedAt, ')
          ..write('status: $status, ')
          ..write('attempts: $attempts, ')
          ..write('lastError: $lastError, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }
}

abstract class _$AppDatabase extends GeneratedDatabase {
  _$AppDatabase(QueryExecutor e) : super(e);
  $AppDatabaseManager get managers => $AppDatabaseManager(this);
  late final $QueuedScansTable queuedScans = $QueuedScansTable(this);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [queuedScans];
}

typedef $$QueuedScansTableCreateCompanionBuilder = QueuedScansCompanion
    Function({
  Value<int> id,
  required String deliveryId,
  required String customerCode,
  required double deliveredLitres,
  Value<double?> cashCollected,
  Value<String?> note,
  required String kind,
  required DateTime scannedAt,
  Value<QueuedScanStatus> status,
  Value<int> attempts,
  Value<String?> lastError,
  Value<DateTime> updatedAt,
});
typedef $$QueuedScansTableUpdateCompanionBuilder = QueuedScansCompanion
    Function({
  Value<int> id,
  Value<String> deliveryId,
  Value<String> customerCode,
  Value<double> deliveredLitres,
  Value<double?> cashCollected,
  Value<String?> note,
  Value<String> kind,
  Value<DateTime> scannedAt,
  Value<QueuedScanStatus> status,
  Value<int> attempts,
  Value<String?> lastError,
  Value<DateTime> updatedAt,
});

class $$QueuedScansTableFilterComposer
    extends Composer<_$AppDatabase, $QueuedScansTable> {
  $$QueuedScansTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get deliveryId => $composableBuilder(
      column: $table.deliveryId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get customerCode => $composableBuilder(
      column: $table.customerCode, builder: (column) => ColumnFilters(column));

  ColumnFilters<double> get deliveredLitres => $composableBuilder(
      column: $table.deliveredLitres,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<double> get cashCollected => $composableBuilder(
      column: $table.cashCollected, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get note => $composableBuilder(
      column: $table.note, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get kind => $composableBuilder(
      column: $table.kind, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get scannedAt => $composableBuilder(
      column: $table.scannedAt, builder: (column) => ColumnFilters(column));

  ColumnWithTypeConverterFilters<QueuedScanStatus, QueuedScanStatus, int>
      get status => $composableBuilder(
          column: $table.status,
          builder: (column) => ColumnWithTypeConverterFilters(column));

  ColumnFilters<int> get attempts => $composableBuilder(
      column: $table.attempts, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get lastError => $composableBuilder(
      column: $table.lastError, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt, builder: (column) => ColumnFilters(column));
}

class $$QueuedScansTableOrderingComposer
    extends Composer<_$AppDatabase, $QueuedScansTable> {
  $$QueuedScansTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get deliveryId => $composableBuilder(
      column: $table.deliveryId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get customerCode => $composableBuilder(
      column: $table.customerCode,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<double> get deliveredLitres => $composableBuilder(
      column: $table.deliveredLitres,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<double> get cashCollected => $composableBuilder(
      column: $table.cashCollected,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get note => $composableBuilder(
      column: $table.note, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get kind => $composableBuilder(
      column: $table.kind, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get scannedAt => $composableBuilder(
      column: $table.scannedAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get status => $composableBuilder(
      column: $table.status, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get attempts => $composableBuilder(
      column: $table.attempts, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get lastError => $composableBuilder(
      column: $table.lastError, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt, builder: (column) => ColumnOrderings(column));
}

class $$QueuedScansTableAnnotationComposer
    extends Composer<_$AppDatabase, $QueuedScansTable> {
  $$QueuedScansTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get deliveryId => $composableBuilder(
      column: $table.deliveryId, builder: (column) => column);

  GeneratedColumn<String> get customerCode => $composableBuilder(
      column: $table.customerCode, builder: (column) => column);

  GeneratedColumn<double> get deliveredLitres => $composableBuilder(
      column: $table.deliveredLitres, builder: (column) => column);

  GeneratedColumn<double> get cashCollected => $composableBuilder(
      column: $table.cashCollected, builder: (column) => column);

  GeneratedColumn<String> get note =>
      $composableBuilder(column: $table.note, builder: (column) => column);

  GeneratedColumn<String> get kind =>
      $composableBuilder(column: $table.kind, builder: (column) => column);

  GeneratedColumn<DateTime> get scannedAt =>
      $composableBuilder(column: $table.scannedAt, builder: (column) => column);

  GeneratedColumnWithTypeConverter<QueuedScanStatus, int> get status =>
      $composableBuilder(column: $table.status, builder: (column) => column);

  GeneratedColumn<int> get attempts =>
      $composableBuilder(column: $table.attempts, builder: (column) => column);

  GeneratedColumn<String> get lastError =>
      $composableBuilder(column: $table.lastError, builder: (column) => column);

  GeneratedColumn<DateTime> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);
}

class $$QueuedScansTableTableManager extends RootTableManager<
    _$AppDatabase,
    $QueuedScansTable,
    QueuedScan,
    $$QueuedScansTableFilterComposer,
    $$QueuedScansTableOrderingComposer,
    $$QueuedScansTableAnnotationComposer,
    $$QueuedScansTableCreateCompanionBuilder,
    $$QueuedScansTableUpdateCompanionBuilder,
    (QueuedScan, BaseReferences<_$AppDatabase, $QueuedScansTable, QueuedScan>),
    QueuedScan,
    PrefetchHooks Function()> {
  $$QueuedScansTableTableManager(_$AppDatabase db, $QueuedScansTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$QueuedScansTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$QueuedScansTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$QueuedScansTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<int> id = const Value.absent(),
            Value<String> deliveryId = const Value.absent(),
            Value<String> customerCode = const Value.absent(),
            Value<double> deliveredLitres = const Value.absent(),
            Value<double?> cashCollected = const Value.absent(),
            Value<String?> note = const Value.absent(),
            Value<String> kind = const Value.absent(),
            Value<DateTime> scannedAt = const Value.absent(),
            Value<QueuedScanStatus> status = const Value.absent(),
            Value<int> attempts = const Value.absent(),
            Value<String?> lastError = const Value.absent(),
            Value<DateTime> updatedAt = const Value.absent(),
          }) =>
              QueuedScansCompanion(
            id: id,
            deliveryId: deliveryId,
            customerCode: customerCode,
            deliveredLitres: deliveredLitres,
            cashCollected: cashCollected,
            note: note,
            kind: kind,
            scannedAt: scannedAt,
            status: status,
            attempts: attempts,
            lastError: lastError,
            updatedAt: updatedAt,
          ),
          createCompanionCallback: ({
            Value<int> id = const Value.absent(),
            required String deliveryId,
            required String customerCode,
            required double deliveredLitres,
            Value<double?> cashCollected = const Value.absent(),
            Value<String?> note = const Value.absent(),
            required String kind,
            required DateTime scannedAt,
            Value<QueuedScanStatus> status = const Value.absent(),
            Value<int> attempts = const Value.absent(),
            Value<String?> lastError = const Value.absent(),
            Value<DateTime> updatedAt = const Value.absent(),
          }) =>
              QueuedScansCompanion.insert(
            id: id,
            deliveryId: deliveryId,
            customerCode: customerCode,
            deliveredLitres: deliveredLitres,
            cashCollected: cashCollected,
            note: note,
            kind: kind,
            scannedAt: scannedAt,
            status: status,
            attempts: attempts,
            lastError: lastError,
            updatedAt: updatedAt,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$QueuedScansTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $QueuedScansTable,
    QueuedScan,
    $$QueuedScansTableFilterComposer,
    $$QueuedScansTableOrderingComposer,
    $$QueuedScansTableAnnotationComposer,
    $$QueuedScansTableCreateCompanionBuilder,
    $$QueuedScansTableUpdateCompanionBuilder,
    (QueuedScan, BaseReferences<_$AppDatabase, $QueuedScansTable, QueuedScan>),
    QueuedScan,
    PrefetchHooks Function()>;

class $AppDatabaseManager {
  final _$AppDatabase _db;
  $AppDatabaseManager(this._db);
  $$QueuedScansTableTableManager get queuedScans =>
      $$QueuedScansTableTableManager(_db, _db.queuedScans);
}
