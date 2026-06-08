import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'tokens.dart';

ThemeData buildJharanaiTheme() {
  final base = ThemeData.light(useMaterial3: true);
  return base.copyWith(
    scaffoldBackgroundColor: JharanaiTokens.bg,
    colorScheme: ColorScheme.fromSeed(
      seedColor: JharanaiTokens.brand,
      primary: JharanaiTokens.brand,
      surface: JharanaiTokens.surface,
      error: JharanaiTokens.danger,
    ),
    textTheme: GoogleFonts.interTextTheme(base.textTheme).apply(
      bodyColor: JharanaiTokens.textPrimary,
      displayColor: JharanaiTokens.textPrimary,
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: JharanaiTokens.surface,
      foregroundColor: JharanaiTokens.textPrimary,
      elevation: 0,
      centerTitle: false,
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: JharanaiTokens.brand,
        foregroundColor: JharanaiTokens.brandFg,
        minimumSize: const Size.fromHeight(52),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(JharanaiTokens.radiusLg),
        ),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
      ),
    ),
    cardTheme: CardTheme(
      color: JharanaiTokens.surface,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(JharanaiTokens.radiusLg),
        side: const BorderSide(color: JharanaiTokens.border),
      ),
    ),
  );
}
