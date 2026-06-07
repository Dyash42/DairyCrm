import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'auth/auth_provider.dart';
import 'screens/login_screen.dart';
import 'screens/todays_route_screen.dart';
import 'sync/sync_engine.dart';
import 'theme/app_theme.dart';
import 'theme/tokens.dart';

void main() {
  runApp(const ProviderScope(child: JharanaiApp()));
}

class JharanaiApp extends StatelessWidget {
  const JharanaiApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Jharanai · Delivery',
      debugShowCheckedModeBanner: false,
      theme: buildJharanaiTheme(),
      home: const _AuthGate(),
    );
  }
}

/// Watches auth state and routes to the right screen. Also boots the
/// sync engine so it starts listening to connectivity from app launch.
class _AuthGate extends ConsumerWidget {
  const _AuthGate();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Touch the sync engine so it spins up on app launch.
    ref.watch(syncEngineProvider);

    final state = ref.watch(authStateProvider);
    if (state is AuthUnknown) {
      return const _BootSplash();
    }
    if (state is AuthSignedIn) {
      return const TodaysRouteScreen();
    }
    return const LoginScreen();
  }
}

class _BootSplash extends StatelessWidget {
  const _BootSplash();
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: JharanaiTokens.brand,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.15),
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Icon(Icons.water_drop_rounded, color: Colors.white, size: 36),
            ),
            const SizedBox(height: 16),
            const Text(
              'Jharanai',
              style: TextStyle(
                color: Colors.white,
                fontSize: 22,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 24),
            const SizedBox(
              width: 28,
              height: 28,
              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
            ),
          ],
        ),
      ),
    );
  }
}
