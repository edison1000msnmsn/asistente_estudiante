import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/constants.dart';
import '../../../core/storage/providers.dart';
import '../../../shared/widgets/kid_button.dart';

class RewardScreen extends ConsumerWidget {
  const RewardScreen({super.key, required this.module, required this.success});

  final ModuleId module;
  final bool success;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(appStateProvider).profile;
    final progress = profile == null
        ? null
        : ref.watch(appRepositoryProvider).getProgress(profile.id, module.id);
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(success ? '🎉' : '💡', style: const TextStyle(fontSize: 96)),
              const SizedBox(height: 16),
              Text(
                success ? '¡Excelente trabajo!' : 'Buen intento',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                success
                    ? 'Ganaste estrellas y avanzaste en ${module.label}.'
                    : 'La ayuda visual tambien es parte del aprendizaje.',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 18),
              ),
              const SizedBox(height: 22),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(18),
                  child: Column(
                    children: [
                      Text('Estrellas del modulo: ${progress?.stars ?? 0} ⭐'),
                      Text('Aciertos: ${progress?.correctAnswers ?? 0}'),
                      Text('Errores: ${progress?.wrongAnswers ?? 0}'),
                      Text('Nivel actual: ${progress?.currentLevel ?? 1}'),
                      if ((progress?.currentLevel ?? 1) >= 10)
                        const Text('Medalla desbloqueable 🏅'),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 20),
              KidButton(
                label: 'Siguiente nivel',
                icon: Icons.play_arrow_rounded,
                backgroundColor: module.color,
                onPressed: () => context.go('/module/${module.id}'),
              ),
              const SizedBox(height: 10),
              KidButton(
                label: 'Volver al inicio',
                icon: Icons.home_rounded,
                onPressed: () => context.go('/home'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
