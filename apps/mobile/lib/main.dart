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

/// DEMO-MODE auth gate.
///
/// The login + OTP flow is bypassed for now so the app boots straight
/// into Today's Route. The route_provider already does cache + API +
/// fallback, so when the unauthenticated GET /deliveries/today returns
/// 401 the screen quietly falls back to the seeded mock data and the
/// UI keeps working. The dev drawer (swipe from the left edge) lets
/// you switch between morning / mid-route / route-complete demo modes.
///
/// To restore real OTP login, swap _AuthGate back to its previous
/// implementation (the LoginScreen widget + AuthStateProvider are
/// still in the codebase, just unreferenced from main).
class _AuthGate extends ConsumerWidget {
  const _AuthGate();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Touch the sync engine so it spins up on app launch (offline
    // queue ready even if we end up with mock data).
    ref.watch(syncEngineProvider);
    return const TodaysRouteScreen();
  }
}

// LoginScreen + AuthStateProvider stay imported so they don't break
// the rest of the app — restoring real auth is a one-line change.
// ignore: unused_element
class _RealAuthGate extends ConsumerWidget {
  const _RealAuthGate();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
