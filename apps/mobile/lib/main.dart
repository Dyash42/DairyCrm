import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
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
      title: 'Jharanai',
      debugShowCheckedModeBanner: false,
      theme: buildJharanaiTheme(),
      home: const _PlaceholderHome(),
    );
  }
}

/// Placeholder home — Today's Route screen will replace this.
class _PlaceholderHome extends StatelessWidget {
  const _PlaceholderHome();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Jharanai · Delivery')),
      body: const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            'Today\'s Route screen — coming next.\n\n'
            'Stack: Flutter 3.22 · Riverpod · Drift (offline SQLite) · '
            'mobile_scanner (QR) · Dio (API).',
            textAlign: TextAlign.center,
            style: TextStyle(color: JharanaiTokens.textSecondary, height: 1.6),
          ),
        ),
      ),
    );
  }
}
