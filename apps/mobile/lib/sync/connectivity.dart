import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// True when there's at least one usable network interface.
/// Wraps connectivity_plus so the rest of the app doesn't import it.
final connectivityStreamProvider = StreamProvider<bool>((ref) {
  final controller = StreamController<bool>();
  final connectivity = Connectivity();

  Future<void> emit(List<ConnectivityResult> result) async {
    final online = result.any((r) =>
        r == ConnectivityResult.wifi ||
        r == ConnectivityResult.mobile ||
        r == ConnectivityResult.ethernet ||
        r == ConnectivityResult.vpn);
    controller.add(online);
  }

  // Initial value
  connectivity.checkConnectivity().then(emit);

  final sub = connectivity.onConnectivityChanged.listen(emit);

  ref.onDispose(() {
    sub.cancel();
    controller.close();
  });

  return controller.stream;
});

/// Convenience boolean — true when offline.
final isOfflineStreamProvider = Provider<bool>((ref) {
  final v = ref.watch(connectivityStreamProvider);
  return v.maybeWhen(data: (online) => !online, orElse: () => false);
});
