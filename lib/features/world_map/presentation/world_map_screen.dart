import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/constants.dart';
import '../../../core/storage/providers.dart';
import '../../../shared/models/module_progress.dart';

class WorldMapScreen extends ConsumerWidget {
  const WorldMapScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(appStateProvider).profile;
    final repository = ref.watch(appRepositoryProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Mapa de mundos')),
      body: ListView(
        padding: const EdgeInsets.all(18),
        children: ModuleId.values.map((module) {
          final progress = profile == null
              ? null
              : repository.getProgress(profile.id, module.id);
          return Card(
            child: ListTile(
              leading: CircleAvatar(
                backgroundColor: module.color,
                foregroundColor: Colors.white,
                child: Icon(module.icon),
              ),
              title: Text(
                _worldName(module),
                style: const TextStyle(fontWeight: FontWeight.w900),
              ),
              subtitle: Text(
                'Nivel ${progress?.currentLevel ?? 1} - Retos ${progress?.completedActivities ?? 0}/${ModuleProgress.totalActivities}',
              ),
              trailing: const Icon(Icons.arrow_forward_rounded),
              onTap: () => context.push('/module/${module.id}'),
            ),
          );
        }).toList(),
      ),
    );
  }

  String _worldName(ModuleId module) => switch (module) {
    ModuleId.math => 'Mundo de Matematicas',
    ModuleId.letters => 'Castillo de Letras',
    ModuleId.art => 'Galeria de Arte',
    ModuleId.logic => 'Isla Logica',
  };
}
