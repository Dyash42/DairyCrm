import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/config.dart';
import '../auth/auth_provider.dart';
// ignore_for_file: unused_import
import '../theme/tokens.dart';
import 'help_screen.dart';

/// Profile / account screen for the logged-in executive.
///
/// Shows their name, phone, role, the API base they're talking to (useful
/// for support: "are you on staging or prod?"), a help link, and a
/// sign-out button.
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final apiBase = ApiConfig.baseUrl;

    return Scaffold(
      backgroundColor: JharanaiTokens.bg,
      appBar: AppBar(
        title: const Text('Account'),
        backgroundColor: JharanaiTokens.surface,
        foregroundColor: JharanaiTokens.textPrimary,
        elevation: 0,
        scrolledUnderElevation: 0,
        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(1),
          child: Divider(height: 1, color: JharanaiTokens.divider),
        ),
      ),
      body: ListView(
        children: [
          // Profile header
          Container(
            color: JharanaiTokens.surface,
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 32,
                  backgroundColor: JharanaiTokens.brand,
                  child: Text(
                    _initials(user?.name ?? '?'),
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w600,
                      fontSize: 18,
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        user?.name ?? 'Signed out',
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w600,
                          color: JharanaiTokens.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        user?.role ?? '',
                        style: const TextStyle(
                          fontSize: 13,
                          color: JharanaiTokens.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Info rows
          _Section(
            title: 'Account',
            children: [
              _InfoRow(label: 'User ID', value: user?.id ?? '—'),
              _InfoRow(label: 'Role', value: user?.role ?? '—'),
            ],
          ),
          const SizedBox(height: 12),
          _Section(
            title: 'Connection',
            children: [
              _InfoRow(label: 'Server', value: apiBase),
            ],
          ),
          const SizedBox(height: 12),
          _Section(
            title: 'Help & support',
            children: [
              _LinkRow(
                icon: Icons.help_outline,
                label: 'How to use the app',
                onTap: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const HelpScreen()),
                  );
                },
              ),
              _LinkRow(
                icon: Icons.info_outline,
                label: 'About Jharanai',
                onTap: () => _showAboutDialog(context),
              ),
            ],
          ),
          const SizedBox(height: 24),

          // Sign out
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () async {
                  final ok = await showDialog<bool>(
                    context: context,
                    builder: (ctx) => AlertDialog(
                      title: const Text('Sign out?'),
                      content: const Text(
                        "You'll need to log in again with the OTP next time.",
                      ),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(ctx, false),
                          child: const Text('Cancel'),
                        ),
                        FilledButton(
                          onPressed: () => Navigator.pop(ctx, true),
                          child: const Text('Sign out'),
                        ),
                      ],
                    ),
                  );
                  if (ok == true) {
                    await ref.read(authStateProvider.notifier).signOut();
                  }
                },
                icon: const Icon(Icons.logout, color: JharanaiTokens.dangerDark),
                label: const Text(
                  'Sign out',
                  style: TextStyle(color: JharanaiTokens.dangerDark),
                ),
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  side: const BorderSide(color: JharanaiTokens.border),
                ),
              ),
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty || parts[0].isEmpty) return '?';
    if (parts.length == 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  void _showAboutDialog(BuildContext context) {
    showAboutDialog(
      context: context,
      applicationName: 'Jharanai · Delivery',
      applicationVersion: '1.0.0',
      applicationLegalese:
          '© 2026 Jharanai Dairy. Built for the daily milk run.',
      children: const [
        SizedBox(height: 12),
        Text(
          "This app is the milkman's daily companion. Scan each customer's QR "
          'when you drop their milk; the system records everything, sends them '
          'a WhatsApp confirmation, and tracks payments — even if you go '
          'offline for a stretch.',
        ),
      ],
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children});
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: JharanaiTokens.surface,
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 4),
            child: Text(
              title.toUpperCase(),
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                letterSpacing: 0.5,
                color: JharanaiTokens.textMuted,
              ),
            ),
          ),
          ...children,
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 10, 20, 10),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: const TextStyle(
                fontSize: 14,
                color: JharanaiTokens.textSecondary,
              ),
            ),
          ),
          Text(
            value,
            style: const TextStyle(
              fontSize: 14,
              color: JharanaiTokens.textPrimary,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}

class _LinkRow extends StatelessWidget {
  const _LinkRow({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
        child: Row(
          children: [
            Icon(icon, size: 20, color: JharanaiTokens.textSecondary),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                label,
                style: const TextStyle(
                  fontSize: 14,
                  color: JharanaiTokens.textPrimary,
                ),
              ),
            ),
            const Icon(
              Icons.chevron_right,
              color: JharanaiTokens.textMuted,
            ),
          ],
        ),
      ),
    );
  }
}
