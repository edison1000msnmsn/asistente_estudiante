import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../app/constants.dart';
import '../shared/widgets/kid_button.dart';

class LevelUpScreen extends StatelessWidget {
  const LevelUpScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.lavender,
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Text('🎊', style: TextStyle(fontSize: 104)),
              Text(
                '¡Subiste de nivel!',
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.w900,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              const Text(
                'Nueva recompensa desbloqueada.',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              KidButton(
                label: 'Continuar',
                icon: Icons.home_rounded,
                backgroundColor: AppColors.purple,
                onPressed: () => context.go('/home'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
