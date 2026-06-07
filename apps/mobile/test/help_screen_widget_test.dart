/// Widget test for the Help screen — confirms the page renders and the
/// key onboarding cues are present so a non-technical milkman can self-serve.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jharanai_mobile/screens/help_screen.dart';

void main() {
  testWidgets('HelpScreen renders the 5 onboarding steps', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(home: HelpScreen()),
    );

    // The 5 step numbers should all appear
    expect(find.text('1'), findsOneWidget);
    expect(find.text('2'), findsOneWidget);
    expect(find.text('3'), findsOneWidget);
    expect(find.text('4'), findsOneWidget);
    expect(find.text('5'), findsOneWidget);

    // Screen title in the AppBar
    expect(find.text('How to use the app'), findsOneWidget);
  });

  testWidgets('HelpScreen shows the offline-first messaging', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(home: HelpScreen()),
    );
    await tester.pumpAndSettle();

    expect(
      find.textContaining("If you're offline"),
      findsOneWidget,
    );
  });

  testWidgets('HelpScreen surfaces the OTP-safety warning', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(home: HelpScreen()),
    );

    // Scroll to make sure the bottom banners are realized
    await tester.drag(find.byType(ListView), const Offset(0, -800));
    await tester.pump();

    expect(find.text('Never share your OTP'), findsOneWidget);
  });
}
