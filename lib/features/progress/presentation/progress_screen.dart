import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/constants.dart';
import '../../../core/gamification/gamification_service.dart';
import '../../../core/storage/providers.dart';
import '../../../shared/models/module_progress.dart';
import '../../../shared/widgets/empty_state.dart';

class ProgressScreen extends ConsumerWidget {
  const ProgressScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(appStateProvider).profile;
    if (profile == null) {
      return const EmptyState(message: 'Crea un perfil para ver progreso.');
    }
    final repository = ref.watch(appRepositoryProvider);
    final progress = repository.getAllProgress(profile.id);
    final stars = GamificationService.totalStars(progress);
    final achievements = repository.achievements();

    return Scaffold(
      appBar: AppBar(title: const Text('Mi progreso')),
      body: ListView(
        padding: const EdgeInsets.all(18),
        children: [
          Text(
            'Nivel ${GamificationService.globalLevel(stars)}',
            style: Theme.of(
              context,
            ).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w900),
          ),
          Text('$stars estrellas acumuladas ⭐'),
          const SizedBox(height: 16),
          ...ModuleId.values.map((module) {
            final item = repository.getProgress(profile.id, module.id);
            return Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(module.icon, color: module.color),
                        const SizedBox(width: 8),
                        Text(
                          module.label,
                          style: const TextStyle(fontWeight: FontWeight.w900),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    LinearProgressIndicator(
                      value:
                          item.completedActivities /
                          ModuleProgress.totalActivities,
                      minHeight: 12,
                      color: module.color,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Nivel ${item.currentLevel} - Retos ${item.completedActivities}/${ModuleProgress.totalActivities} - Precision ${item.accuracyPercentage.toStringAsFixed(0)}%',
                    ),
                  ],
                ),
              ),
            );
          }),
          const SizedBox(height: 12),
          Text(
            'Medallas',
            style: Theme.of(
              context,
            ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900),
          ),
          if (achievements.isEmpty)
            const Text('Completa mas niveles para ganar medallas.'),
          ...achievements.map(
            (item) => ListTile(
              leading: Text(item.icon, style: const TextStyle(fontSize: 28)),
              title: Text(item.name),
              subtitle: Text(item.description),
            ),
          ),
        ],
      ),
    );
  }
}
