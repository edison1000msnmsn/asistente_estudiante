import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/constants.dart';
import '../../../core/storage/providers.dart';
import '../../../shared/widgets/kid_button.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  final nicknameController = TextEditingController();
  int age = 6;
  String grade = 'Inicial';
  String avatar = '🦉';
  final avatars = ['🦉', '🦄', '⭐', '🐝', '🚀'];
  final grades = ['Inicial', 'Primer grado', 'Segundo grado'];

  @override
  void initState() {
    super.initState();
    final profile = ref.read(appStateProvider).profile;
    if (profile != null) {
      nicknameController.text = profile.nickname;
      age = profile.age;
      grade = profile.grade;
      avatar = profile.avatar;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Mi perfil')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text(
            'Elige tu avatar',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 12,
            children: avatars.map((item) {
              return ChoiceChip(
                label: Text(item, style: const TextStyle(fontSize: 30)),
                selected: avatar == item,
                onSelected: (_) => setState(() => avatar = item),
              );
            }).toList(),
          ),
          const SizedBox(height: 20),
          TextField(
            controller: nicknameController,
            maxLength: 16,
            decoration: const InputDecoration(
              labelText: 'Apodo',
              hintText: 'Ejemplo: Nico',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<int>(
            initialValue: age,
            decoration: const InputDecoration(
              labelText: 'Edad',
              border: OutlineInputBorder(),
            ),
            items: [4, 5, 6, 7, 8]
                .map(
                  (value) => DropdownMenuItem(
                    value: value,
                    child: Text('$value anos'),
                  ),
                )
                .toList(),
            onChanged: (value) => setState(() => age = value ?? age),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: grade,
            decoration: const InputDecoration(
              labelText: 'Nivel educativo',
              border: OutlineInputBorder(),
            ),
            items: grades
                .map(
                  (value) => DropdownMenuItem(value: value, child: Text(value)),
                )
                .toList(),
            onChanged: (value) => setState(() => grade = value ?? grade),
          ),
          const SizedBox(height: 24),
          KidButton(
            label: 'Guardar y jugar',
            icon: Icons.check_circle_rounded,
            backgroundColor: AppColors.green,
            onPressed: () async {
              final nickname = nicknameController.text.trim().isEmpty
                  ? 'Explorador'
                  : nicknameController.text.trim();
              await ref
                  .read(appStateProvider.notifier)
                  .saveProfile(nickname, age, grade, avatar);
              if (context.mounted) context.go('/home');
            },
          ),
        ],
      ),
    );
  }
}
