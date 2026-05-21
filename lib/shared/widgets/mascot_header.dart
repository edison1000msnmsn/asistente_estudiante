import 'package:flutter/material.dart';

import '../../app/constants.dart';

class MascotHeader extends StatelessWidget {
  const MascotHeader({super.key, required this.message, this.avatar = '🦉'});

  final String message;
  final String avatar;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.lavender,
        borderRadius: BorderRadius.circular(24),
      ),
      child: Row(
        children: [
          Text(avatar, style: const TextStyle(fontSize: 48)),
          const SizedBox(width: 14),
          Expanded(
            child: Text(
              message,
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
            ),
          ),
        ],
      ),
    );
  }
}
