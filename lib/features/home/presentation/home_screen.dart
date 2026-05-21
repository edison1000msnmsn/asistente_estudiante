import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/constants.dart';
import '../../../core/gamification/gamification_service.dart';
import '../../../core/storage/providers.dart';
import '../../../shared/models/module_progress.dart';
import '../../../shared/widgets/mascot_header.dart';
import '../../../shared/widgets/module_card.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(appStateProvider);
    final profile = state.profile;
    if (profile == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final repository = ref.watch(appRepositoryProvider);
    final progress = repository.getAllProgress(profile.id);
    final totalStars = GamificationService.totalStars(progress);
    final level = GamificationService.globalLevel(totalStars);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Inicio'),
        actions: [
          IconButton(
            onPressed: () => context.push('/settings'),
            icon: const Icon(Icons.settings_rounded),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(18),
        children: [
          Text(
            'Hola, ${profile.nickname} ${profile.avatar}',
            style: Theme.of(
              context,
            ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _StatTile(label: 'Estrellas', value: '$totalStars ⭐'),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _StatTile(label: 'Nivel', value: '$level'),
              ),
            ],
          ),
          const SizedBox(height: 14),
          LinearProgressIndicator(
            value: (totalStars % 150) / 150,
            minHeight: 12,
            color: AppColors.yellow,
          ),
          const SizedBox(height: 18),
          const MascotHeader(
            message: 'Elige un mundo y resuelve un reto corto.',
          ),
          const SizedBox(height: 18),
          GridView.count(
            crossAxisCount: MediaQuery.sizeOf(context).width > 650 ? 4 : 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 0.9,
            children: ModuleId.values.map((module) {
              final moduleProgress = repository.getProgress(
                profile.id,
                module.id,
              );
              return ModuleCard(
                title: module.label,
                subtitle:
                    'Nivel ${moduleProgress.currentLevel} - ${moduleProgress.completedActivities}/${ModuleProgress.totalActivities} retos',
                icon: module.icon,
                color: module.color,
                progress:
                    moduleProgress.completedActivities /
                    ModuleProgress.totalActivities,
                onTap: () => context.push('/module/${module.id}'),
              );
            }).toList(),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              OutlinedButton.icon(
                onPressed: () => context.push('/world-map'),
                icon: const Icon(Icons.map_rounded),
                label: const Text('Mapa'),
              ),
              OutlinedButton.icon(
                onPressed: () => context.push('/progress'),
                icon: const Icon(Icons.bar_chart_rounded),
                label: const Text('Progreso'),
              ),
              OutlinedButton.icon(
                onPressed: () => context.push('/parent'),
                icon: const Icon(Icons.lock_rounded),
                label: const Text('Adultos'),
              ),
              OutlinedButton.icon(
                onPressed: () => context.push('/academic'),
                icon: const Icon(Icons.school_rounded),
                label: const Text('Info academica'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
            Text(
              value,
              style: Theme.of(
                context,
              ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900),
            ),
          ],
        ),
      ),
    );
  }
}
