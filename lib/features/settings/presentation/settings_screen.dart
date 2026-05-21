import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/storage/providers.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(appStateProvider);
    final settings = state.settings;
    return Scaffold(
      appBar: AppBar(title: const Text('Configuracion')),
      body: ListView(
        padding: const EdgeInsets.all(18),
        children: [
          SwitchListTile(
            value: settings.soundEnabled,
            title: const Text('Sonido'),
            onChanged: (value) => ref
                .read(appStateProvider.notifier)
                .saveSettings(settings.copyWith(soundEnabled: value)),
          ),
          SwitchListTile(
            value: settings.musicEnabled,
            title: const Text('Musica'),
            onChanged: (value) => ref
                .read(appStateProvider.notifier)
                .saveSettings(settings.copyWith(musicEnabled: value)),
          ),
          ListTile(
            leading: const Icon(Icons.timer_rounded),
            title: const Text('Tiempo recomendado'),
            subtitle: Text('${settings.maxSessionMinutes} minutos'),
            trailing: DropdownButton<int>(
              value: settings.maxSessionMinutes,
              items: [10, 15, 20]
                  .map(
                    (value) =>
                        DropdownMenuItem(value: value, child: Text('$value')),
                  )
                  .toList(),
              onChanged: (value) {
                if (value != null) {
                  ref
                      .read(appStateProvider.notifier)
                      .saveSettings(
                        settings.copyWith(maxSessionMinutes: value),
                      );
                }
              },
            ),
          ),
          ListTile(
            leading: const Icon(Icons.person_rounded),
            title: const Text('Editar perfil'),
            onTap: () => context.push('/profile'),
          ),
          ListTile(
            leading: const Icon(Icons.restart_alt_rounded, color: Colors.red),
            title: const Text('Reiniciar progreso'),
            subtitle: const Text('Requiere confirmacion adulta'),
            onTap: () async {
              final ok = await showDialog<bool>(
                context: context,
                builder: (context) => AlertDialog(
                  title: const Text('Confirmar reinicio'),
                  content: const Text(
                    'Esta accion borra progreso, estrellas e intentos locales.',
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: const Text('Cancelar'),
                    ),
                    FilledButton(
                      onPressed: () => Navigator.pop(context, true),
                      child: const Text('Reiniciar'),
                    ),
                  ],
                ),
              );
              if (ok == true) {
                ref.read(appStateProvider.notifier).resetProgress();
              }
            },
          ),
          const Divider(),
          const ListTile(
            leading: Icon(Icons.security_rounded),
            title: Text('Seguridad y privacidad'),
            subtitle: Text(
              'Sin publicidad, compras, chat, camara, microfono, ubicacion ni enlaces externos para ninos. Los datos se guardan solo en el dispositivo.',
            ),
          ),
        ],
      ),
    );
  }
}
