import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../app/constants.dart';
import '../../../core/storage/providers.dart';
import '../../../shared/widgets/empty_state.dart';

class ParentDashboardScreen extends ConsumerStatefulWidget {
  const ParentDashboardScreen({super.key});

  @override
  ConsumerState<ParentDashboardScreen> createState() =>
      _ParentDashboardScreenState();
}

class _ParentDashboardScreenState extends ConsumerState<ParentDashboardScreen> {
  final pinController = TextEditingController();
  bool unlocked = false;

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(appStateProvider);
    final profile = state.profile;
    if (profile == null) {
      return const EmptyState(message: 'No hay perfil infantil registrado.');
    }
    if (!unlocked) {
      return Scaffold(
        appBar: AppBar(title: const Text('Acceso adulto')),
        body: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            children: [
              const Text(
                'Ingresa el PIN de adulto para ver el panel. PIN demo: 1234',
              ),
              const SizedBox(height: 12),
              TextField(
                controller: pinController,
                keyboardType: TextInputType.number,
                obscureText: true,
                decoration: const InputDecoration(
                  border: OutlineInputBorder(),
                  labelText: 'PIN',
                ),
              ),
              const SizedBox(height: 12),
              ElevatedButton.icon(
                onPressed: () => setState(
                  () =>
                      unlocked = pinController.text == state.settings.adultPin,
                ),
                icon: const Icon(Icons.lock_open_rounded),
                label: const Text('Ingresar'),
              ),
            ],
          ),
        ),
      );
    }

    final repository = ref.watch(appRepositoryProvider);
    final progress = repository.getAllProgress(profile.id);
    final best = [...progress]
      ..sort((a, b) => b.accuracyPercentage.compareTo(a.accuracyPercentage));
    final weak = [...progress]
      ..sort((a, b) => a.accuracyPercentage.compareTo(b.accuracyPercentage));
    final last = repository.lastSession;

    return Scaffold(
      appBar: AppBar(title: const Text('Panel padres/docentes')),
      body: ListView(
        padding: const EdgeInsets.all(18),
        children: [
          Text(
            '${profile.nickname}, ${profile.age} anos - ${profile.grade}',
            style: Theme.of(
              context,
            ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900),
          ),
          Text(
            'Tiempo total: ${(repository.totalUsageSeconds / 60).toStringAsFixed(1)} min',
          ),
          Text(
            'Ultima sesion: ${last == null ? 'Sin registro' : DateFormat('dd/MM/yyyy HH:mm').format(last)}',
          ),
          const SizedBox(height: 12),
          ...ModuleId.values.map((module) {
            final item = repository.getProgress(profile.id, module.id);
            return ListTile(
              leading: Icon(module.icon, color: module.color),
              title: Text(module.label),
              subtitle: Text(
                'Aciertos ${item.correctAnswers} - Errores ${item.wrongAnswers} - Precision ${item.accuracyPercentage.toStringAsFixed(0)}%',
              ),
            );
          }),
          const Divider(),
          Text('Mejor desempeno: ${_moduleName(best.first.moduleId)}'),
          Text('Requiere refuerzo: ${_moduleName(weak.first.moduleId)}'),
          const SizedBox(height: 12),
          const Text(
            'Recomendaciones:',
            style: TextStyle(fontWeight: FontWeight.w900),
          ),
          const Text('Reforzar conteo del 1 al 10.'),
          const Text('Practicar vocales con imagenes.'),
          const Text(
            'Mantener sesiones breves de 10 a 15 minutos con acompanamiento adulto.',
          ),
          const SizedBox(height: 12),
          SelectableText(
            'Resumen local:\n${repository.exportProgressJson(profile.id)}',
          ),
        ],
      ),
    );
  }

  String _moduleName(String id) =>
      ModuleId.values.firstWhere((item) => item.id == id).label;
}
