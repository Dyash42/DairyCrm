import 'package:flutter/material.dart';

/// Jharanai design tokens — mirror of packages/shared/src/tokens.ts
/// Keep both in sync. When you change a token, update both files in the same PR.
class JharanaiTokens {
  JharanaiTokens._();

  // Brand
  static const brand = Color(0xFF1F4E78);
  static const brandFg = Color(0xFFFFFFFF);
  static const brand50 = Color(0xFFF0F6FB);
  static const brand100 = Color(0xFFD7E6F2);
  static const brand600 = Color(0xFF1A4264);

  // Accent
  static const accent = Color(0xFF1F77B4);
  static const accentLight = Color(0xFF4FC3F7);

  // Status
  static const success = Color(0xFF1F8B4C);
  static const successLight = Color(0xFFE6F3EC);
  static const successDark = Color(0xFF136A38);

  static const warning = Color(0xFFE08400);
  static const warningLight = Color(0xFFFFF1DC);
  static const warningDark = Color(0xFFA85F00);

  static const danger = Color(0xFFC8362B);
  static const dangerLight = Color(0xFFFCE6E3);
  static const dangerDark = Color(0xFF9A2820);

  // Surfaces
  static const bg = Color(0xFFF4F6F8);
  static const surface = Color(0xFFFFFFFF);
  static const surfaceMuted = Color(0xFFF8FAFB);
  static const border = Color(0xFFE5E9EE);
  static const divider = Color(0xFFEEF1F4);

  // Text
  static const textPrimary = Color(0xFF0F1A24);
  static const textSecondary = Color(0xFF5A6878);
  static const textMuted = Color(0xFF8A95A2);

  // Radii
  static const radiusSm = 6.0;
  static const radiusMd = 10.0;
  static const radiusLg = 14.0;
  static const radiusXl = 18.0;
}
