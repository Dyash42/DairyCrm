import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'screens/login_screen.dart';
import 'theme/app_theme.dart';

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
      home: const LoginScreen(),
    );
  }
}
