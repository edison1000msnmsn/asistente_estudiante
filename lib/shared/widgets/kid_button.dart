import 'package:flutter/material.dart';

class KidButton extends StatelessWidget {
  const KidButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.backgroundColor,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final Color? backgroundColor;

  @override
  Widget build(BuildContext context) {
    return ElevatedButton.icon(
      onPressed: onPressed,
      icon: icon == null ? const SizedBox.shrink() : Icon(icon, size: 26),
      label: Text(label, textAlign: TextAlign.center),
      style: ElevatedButton.styleFrom(
        backgroundColor: backgroundColor,
        foregroundColor: backgroundColor == null ? null : Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      ),
    );
  }
}
