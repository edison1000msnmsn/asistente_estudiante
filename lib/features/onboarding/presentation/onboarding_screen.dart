import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../app/constants.dart';
import '../../../shared/widgets/kid_button.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final controller = PageController();
  int page = 0;

  final pages = const [
    (
      '🎲',
      'Aprende jugando',
      'Actividades cortas para contar, leer, crear y pensar.',
    ),
    ('⭐', 'Gana estrellas', 'Cada logro suma estrellas, niveles y medallas.'),
    (
      '👩‍🏫',
      'Progreso visible',
      'Padres y docentes pueden revisar avances de forma segura.',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: () => context.go('/profile'),
                  child: const Text('Saltar'),
                ),
              ),
              Expanded(
                child: PageView.builder(
                  controller: controller,
                  itemCount: pages.length,
                  onPageChanged: (value) => setState(() => page = value),
                  itemBuilder: (context, index) {
                    final item = pages[index];
                    return Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(item.$1, style: const TextStyle(fontSize: 96)),
                        const SizedBox(height: 24),
                        Text(
                          item.$2,
                          style: Theme.of(context).textTheme.headlineMedium
                              ?.copyWith(fontWeight: FontWeight.w900),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          item.$3,
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontSize: 18),
                        ),
                      ],
                    );
                  },
                ),
              ),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(
                  pages.length,
                  (index) => Container(
                    width: page == index ? 28 : 12,
                    height: 12,
                    margin: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      color: page == index ? AppColors.purple : Colors.black12,
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              KidButton(
                label: page == pages.length - 1 ? 'Comenzar' : 'Siguiente',
                icon: Icons.arrow_forward_rounded,
                backgroundColor: AppColors.purple,
                onPressed: () {
                  if (page == pages.length - 1) {
                    context.go('/profile');
                  } else {
                    controller.nextPage(
                      duration: const Duration(milliseconds: 250),
                      curve: Curves.easeOut,
                    );
                  }
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
