import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../app/constants.dart';
import '../core/storage/providers.dart';
import '../shared/models/learning_activity.dart';
import '../shared/models/module_progress.dart';
import '../shared/models/seed_data.dart';
import '../shared/widgets/empty_state.dart';
import '../shared/widgets/kid_button.dart';

class ActivityScreen extends ConsumerStatefulWidget {
  const ActivityScreen({super.key, required this.module});

  final ModuleId module;

  @override
  ConsumerState<ActivityScreen> createState() => _ActivityScreenState();
}

class _ActivityScreenState extends ConsumerState<ActivityScreen> {
  late final DateTime startedAt;
  int lives = 3;
  String? selected;
  bool? isCorrect;
  int counterValue = 0;
  String? paintedColor;
  String? draggedAnswer;
  String? activeActivityId;
  int? firstMemoryIndex;
  final Set<int> revealedCards = {};

  @override
  void initState() {
    super.initState();
    startedAt = DateTime.now();
  }

  @override
  Widget build(BuildContext context) {
    final profile = ref.watch(appStateProvider).profile;
    final activities = SeedData.byModule(widget.module);
    if (profile == null) {
      return const EmptyState(message: 'Crea un perfil para empezar.');
    }
    if (activities.isEmpty) {
      return const EmptyState(
        message: 'Aun no hay actividades en este modulo.',
      );
    }

    final progress = ref
        .watch(appRepositoryProvider)
        .getProgress(profile.id, widget.module.id);
    if (progress.completedActivities >= activities.length) {
      return _ModuleCompletedScreen(module: widget.module, progress: progress);
    }

    final activity = _resolveActiveActivity(activities, progress);
    return Scaffold(
      appBar: AppBar(title: Text(widget.module.label)),
      body: ListView(
        padding: const EdgeInsets.all(18),
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              Chip(label: Text('Nivel ${activity.level}')),
              Chip(label: Text('Vidas: $lives')),
              Chip(
                label: Text(
                  'Reto ${progress.completedActivities + 1} de ${activities.length}',
                ),
              ),
              Chip(label: Text(_friendlyType(activity.type))),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            activity.question,
            style: Theme.of(
              context,
            ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 18),
          _VisualItems(activity: activity, color: widget.module.color),
          const SizedBox(height: 18),
          _InteractionPanel(
            activity: activity,
            color: widget.module.color,
            selected: selected,
            isCorrect: isCorrect,
            counterValue: counterValue,
            paintedColor: paintedColor,
            draggedAnswer: draggedAnswer,
            revealedCards: revealedCards,
            onCounterChanged: selected == null
                ? (value) => setState(() => counterValue = value.clamp(0, 20))
                : null,
            onPainted: selected == null
                ? (value) => setState(() => paintedColor = value)
                : null,
            onDragged: selected == null
                ? (value) {
                    setState(() => draggedAnswer = value);
                    _answer(activity, value);
                  }
                : null,
            onReveal: selected == null
                ? (index, value) => _handleMemoryReveal(activity, index, value)
                : null,
            onAnswer: selected == null
                ? (value) => _answer(activity, value)
                : null,
          ),
          const SizedBox(height: 18),
          if (selected != null)
            Card(
              color: isCorrect == true
                  ? Colors.green.shade50
                  : Colors.red.shade50,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      isCorrect == true ? 'Muy bien' : 'Intentemos otra vez',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(activity.explanation),
                    const SizedBox(height: 12),
                    KidButton(
                      label: isCorrect == true || lives == 0
                          ? 'Ver recompensa'
                          : 'Reintentar este reto',
                      icon: Icons.arrow_forward_rounded,
                      backgroundColor: widget.module.color,
                      onPressed: () {
                        if (isCorrect == true || lives == 0) {
                          context.go(
                            '/reward/${widget.module.id}/${isCorrect == true ? 1 : 0}',
                          );
                        } else {
                          setState(() {
                            selected = null;
                            isCorrect = null;
                            _resetInteraction(keepActivity: true);
                          });
                        }
                      },
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  LearningActivity _resolveActiveActivity(
    List<LearningActivity> activities,
    ModuleProgress progress,
  ) {
    final activeId = activeActivityId;
    if (activeId != null) {
      return activities.firstWhere(
        (activity) => activity.id == activeId,
        orElse: () =>
            activities[progress.completedActivities.clamp(
              0,
              activities.length - 1,
            )],
      );
    }
    final activity =
        activities[progress.completedActivities.clamp(
          0,
          activities.length - 1,
        )];
    activeActivityId = activity.id;
    return activity;
  }

  Future<void> _answer(LearningActivity activity, String answer) async {
    activeActivityId = activity.id;
    final correct = activity.validate(answer);
    final profile = ref.read(appStateProvider).profile;
    if (profile == null) return;
    final seconds = DateTime.now()
        .difference(startedAt)
        .inSeconds
        .clamp(1, 600);
    await ref
        .read(appRepositoryProvider)
        .registerAttempt(
          profileId: profile.id,
          activityId: activity.id,
          moduleId: widget.module.id,
          selectedAnswer: answer,
          isCorrect: correct,
          timeSpentSeconds: seconds,
        );
    await ref.read(appStateProvider.notifier).registerChange();
    setState(() {
      selected = answer;
      isCorrect = correct;
      if (!correct) {
        lives = (lives - 1).clamp(0, 3);
      }
    });
  }

  void _handleMemoryReveal(LearningActivity activity, int index, String value) {
    if (revealedCards.contains(index)) return;
    setState(() => revealedCards.add(index));
    final first = firstMemoryIndex;
    if (first == null) {
      firstMemoryIndex = index;
      return;
    }
    final firstValue = activity.visualItems[first];
    final isPair = firstValue == value && first != index;
    _answer(activity, isPair ? value : '__wrong_pair__');
  }

  void _resetInteraction({required bool keepActivity}) {
    counterValue = 0;
    paintedColor = null;
    draggedAnswer = null;
    firstMemoryIndex = null;
    revealedCards.clear();
    if (!keepActivity) {
      activeActivityId = null;
    }
  }

  String _friendlyType(String type) {
    if (type.contains('contador')) return 'contar';
    if (type.contains('arrastra')) return 'arrastrar';
    if (type.contains('pintado')) return 'pintar';
    if (type.contains('memoria')) return 'memoria';
    return 'elegir';
  }
}

class _ModuleCompletedScreen extends StatelessWidget {
  const _ModuleCompletedScreen({required this.module, required this.progress});

  final ModuleId module;
  final ModuleProgress progress;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(module.label)),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.emoji_events_rounded, size: 96, color: module.color),
            const SizedBox(height: 18),
            Text(
              'Modulo completado',
              textAlign: TextAlign.center,
              style: Theme.of(
                context,
              ).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 12),
            Text(
              'Terminaste ${progress.completedActivities} retos. Revisa tu progreso o vuelve al inicio.',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            KidButton(
              label: 'Ver progreso',
              icon: Icons.bar_chart_rounded,
              backgroundColor: module.color,
              onPressed: () => context.go('/progress'),
            ),
            const SizedBox(height: 12),
            KidButton(
              label: 'Inicio',
              icon: Icons.home_rounded,
              onPressed: () => context.go('/home'),
            ),
          ],
        ),
      ),
    );
  }
}

class _VisualItems extends StatelessWidget {
  const _VisualItems({required this.activity, required this.color});

  final LearningActivity activity;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(28),
      ),
      child: Wrap(
        alignment: WrapAlignment.center,
        spacing: 12,
        runSpacing: 12,
        children: activity.visualItems
            .map((item) => _VisualToken(token: item, color: color))
            .toList(),
      ),
    );
  }
}

class _VisualToken extends StatelessWidget {
  const _VisualToken({required this.token, required this.color});

  final String token;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final icon = _iconFor(token);
    final label = _labelFor(token);
    final shapeColor = _colorFor(token) ?? color;
    if (icon != null) {
      return Container(
        width: 74,
        height: 74,
        decoration: BoxDecoration(
          color: shapeColor.withValues(alpha: 0.16),
          borderRadius: BorderRadius.circular(22),
        ),
        child: Icon(icon, color: shapeColor, size: 40),
      );
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Text(
        label,
        style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
      ),
    );
  }

  IconData? _iconFor(String token) {
    return switch (token) {
      'apple' => Icons.apple_rounded,
      'sun' => Icons.wb_sunny_rounded,
      'star' => Icons.star_rounded,
      'balloon' => Icons.circle_rounded,
      'orange' => Icons.circle_rounded,
      'pear' => Icons.eco_rounded,
      'toy' => Icons.toys_rounded,
      'candy' => Icons.circle_rounded,
      'heart' => Icons.favorite_rounded,
      'flower' => Icons.local_florist_rounded,
      'plane' => Icons.flight_rounded,
      'moon' => Icons.nightlight_round,
      'cloud' => Icons.cloud_rounded,
      'plant' => Icons.grass_rounded,
      'cat' => Icons.pets_rounded,
      'frog' => Icons.cruelty_free_rounded,
      'fire' => Icons.local_fire_department_rounded,
      'snow' => Icons.ac_unit_rounded,
      'car' => Icons.directions_car_rounded,
      'pencil' => Icons.edit_rounded,
      'bread' => Icons.bakery_dining_rounded,
      'circle' => Icons.circle_outlined,
      'square' => Icons.crop_square_rounded,
      'triangle' => Icons.change_history_rounded,
      'rectangle' => Icons.rectangle_outlined,
      _ => null,
    };
  }

  Color? _colorFor(String token) {
    return switch (token) {
      'apple' || 'heart' || 'red' => AppColors.red,
      'sun' || 'star' || 'yellow' => AppColors.yellow,
      'orange' || 'balloon' => AppColors.orange,
      'pear' || 'green' => AppColors.green,
      'moon' || 'blue' => AppColors.blue,
      'pink' => AppColors.pink,
      _ => null,
    };
  }

  String _labelFor(String token) {
    if (token.startsWith('group_a_')) {
      return 'A: ${'*' * int.parse(token.split('_').last)}';
    }
    if (token.startsWith('group_b_')) {
      return 'B: ${'*' * int.parse(token.split('_').last)}';
    }
    return token;
  }
}

class _InteractionPanel extends StatelessWidget {
  const _InteractionPanel({
    required this.activity,
    required this.color,
    required this.selected,
    required this.isCorrect,
    required this.counterValue,
    required this.paintedColor,
    required this.draggedAnswer,
    required this.revealedCards,
    required this.onCounterChanged,
    required this.onPainted,
    required this.onDragged,
    required this.onReveal,
    required this.onAnswer,
  });

  final LearningActivity activity;
  final Color color;
  final String? selected;
  final bool? isCorrect;
  final int counterValue;
  final String? paintedColor;
  final String? draggedAnswer;
  final Set<int> revealedCards;
  final ValueChanged<int>? onCounterChanged;
  final ValueChanged<String>? onPainted;
  final ValueChanged<String>? onDragged;
  final void Function(int index, String value)? onReveal;
  final ValueChanged<String>? onAnswer;

  @override
  Widget build(BuildContext context) {
    final type = activity.type.toLowerCase();
    if (_isCounter(type)) {
      return _CounterChallenge(
        activity: activity,
        color: color,
        value: counterValue,
        onChanged: onCounterChanged,
        onCheck: onAnswer,
      );
    }
    if (type.contains('pintado')) {
      return _PaintChallenge(
        activity: activity,
        color: color,
        paintedColor: paintedColor,
        onPainted: onPainted,
        onCheck: onAnswer,
      );
    }
    if (type.contains('arrastra')) {
      return _DragChallenge(
        activity: activity,
        color: color,
        draggedAnswer: draggedAnswer,
        onDragged: onDragged,
      );
    }
    if (type.contains('memoria')) {
      return _MemoryChallenge(
        activity: activity,
        color: color,
        revealedCards: revealedCards,
        onReveal: onReveal,
      );
    }
    return _OptionGrid(
      activity: activity,
      color: color,
      selected: selected,
      isCorrect: isCorrect,
      onAnswer: onAnswer,
    );
  }

  bool _isCounter(String type) {
    return type.contains('contador') ||
        type.contains('suma') ||
        type.contains('resta') ||
        type.contains('faltante') ||
        type.contains('mixto');
  }
}

class _CounterChallenge extends StatelessWidget {
  const _CounterChallenge({
    required this.activity,
    required this.color,
    required this.value,
    required this.onChanged,
    required this.onCheck,
  });

  final LearningActivity activity;
  final Color color;
  final int value;
  final ValueChanged<int>? onChanged;
  final ValueChanged<String>? onCheck;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          children: [
            const Text(
              'Toca mas o menos hasta llegar a la respuesta.',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 14),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                IconButton.filled(
                  iconSize: 32,
                  onPressed: onChanged == null
                      ? null
                      : () => onChanged!(value - 1),
                  icon: const Icon(Icons.remove_rounded),
                ),
                Container(
                  width: 92,
                  margin: const EdgeInsets.symmetric(horizontal: 16),
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(22),
                  ),
                  child: Text(
                    '$value',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 42,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                IconButton.filled(
                  iconSize: 32,
                  onPressed: onChanged == null
                      ? null
                      : () => onChanged!(value + 1),
                  icon: const Icon(Icons.add_rounded),
                ),
              ],
            ),
            const SizedBox(height: 14),
            KidButton(
              label: 'Comprobar',
              icon: Icons.check_rounded,
              backgroundColor: color,
              onPressed: onCheck == null ? null : () => onCheck!('$value'),
            ),
          ],
        ),
      ),
    );
  }
}

class _PaintChallenge extends StatelessWidget {
  const _PaintChallenge({
    required this.activity,
    required this.color,
    required this.paintedColor,
    required this.onPainted,
    required this.onCheck,
  });

  final LearningActivity activity;
  final Color color;
  final String? paintedColor;
  final ValueChanged<String>? onPainted;
  final ValueChanged<String>? onCheck;

  @override
  Widget build(BuildContext context) {
    final fill = _colorFromName(paintedColor);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 220),
              width: 148,
              height: 148,
              decoration: BoxDecoration(
                color: fill ?? Colors.white,
                shape: _isCircle(activity.visualItems.first)
                    ? BoxShape.circle
                    : BoxShape.rectangle,
                borderRadius: _isCircle(activity.visualItems.first)
                    ? null
                    : BorderRadius.circular(20),
                border: Border.all(color: color, width: 4),
              ),
              child: Icon(
                _shapeIcon(activity.visualItems.first),
                size: 64,
                color: fill == null ? color : Colors.white,
              ),
            ),
            const SizedBox(height: 18),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              alignment: WrapAlignment.center,
              children: activity.options.map((option) {
                return ChoiceChip(
                  label: Text(option),
                  selected: paintedColor == option,
                  avatar: CircleAvatar(
                    backgroundColor: _colorFromName(option) ?? Colors.grey,
                  ),
                  onSelected: onPainted == null
                      ? null
                      : (_) => onPainted!(option),
                );
              }).toList(),
            ),
            const SizedBox(height: 14),
            KidButton(
              label: 'Listo',
              icon: Icons.brush_rounded,
              backgroundColor: color,
              onPressed: paintedColor == null || onCheck == null
                  ? null
                  : () => onCheck!(paintedColor!),
            ),
          ],
        ),
      ),
    );
  }

  bool _isCircle(String value) => value == 'circulo' || value == 'circle';

  IconData _shapeIcon(String value) {
    return switch (value) {
      'estrella' || 'star' => Icons.star_rounded,
      'triangulo' || 'triangle' => Icons.change_history_rounded,
      'cuadrado' || 'square' => Icons.crop_square_rounded,
      _ => Icons.circle_outlined,
    };
  }

  Color? _colorFromName(String? value) {
    return switch (value) {
      'Rojo' => AppColors.red,
      'Azul' => AppColors.blue,
      'Verde' => AppColors.green,
      'Amarillo' => AppColors.yellow,
      'Naranja' => AppColors.orange,
      'Morado' => AppColors.purple,
      _ => null,
    };
  }
}

class _DragChallenge extends StatelessWidget {
  const _DragChallenge({
    required this.activity,
    required this.color,
    required this.draggedAnswer,
    required this.onDragged,
  });

  final LearningActivity activity;
  final Color color;
  final String? draggedAnswer;
  final ValueChanged<String>? onDragged;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          children: [
            DragTarget<String>(
              onAcceptWithDetails: onDragged == null
                  ? null
                  : (details) => onDragged!(details.data),
              builder: (context, candidateData, rejectedData) {
                return AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  width: double.infinity,
                  height: 112,
                  decoration: BoxDecoration(
                    color: candidateData.isEmpty
                        ? color.withValues(alpha: 0.10)
                        : color.withValues(alpha: 0.24),
                    borderRadius: BorderRadius.circular(26),
                    border: Border.all(color: color, width: 3),
                  ),
                  child: Center(
                    child: Text(
                      draggedAnswer ?? 'Arrastra aqui',
                      style: const TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                );
              },
            ),
            const SizedBox(height: 18),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              alignment: WrapAlignment.center,
              children: activity.options.map((option) {
                return Draggable<String>(
                  data: option,
                  feedback: Material(
                    color: Colors.transparent,
                    child: _DragChip(
                      label: option,
                      color: color,
                      elevated: true,
                    ),
                  ),
                  childWhenDragging: Opacity(
                    opacity: 0.35,
                    child: _DragChip(label: option, color: color),
                  ),
                  child: _DragChip(label: option, color: color),
                );
              }).toList(),
            ),
          ],
        ),
      ),
    );
  }
}

class _DragChip extends StatelessWidget {
  const _DragChip({
    required this.label,
    required this.color,
    this.elevated = false,
  });

  final String label;
  final Color color;
  final bool elevated;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(18),
        boxShadow: elevated
            ? [const BoxShadow(blurRadius: 10, color: Colors.black26)]
            : null,
      ),
      child: Text(
        label,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 18,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

class _MemoryChallenge extends StatelessWidget {
  const _MemoryChallenge({
    required this.activity,
    required this.color,
    required this.revealedCards,
    required this.onReveal,
  });

  final LearningActivity activity;
  final Color color;
  final Set<int> revealedCards;
  final void Function(int index, String value)? onReveal;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            const Text(
              'Toca dos cartas para encontrar una pareja.',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 14),
            GridView.count(
              crossAxisCount: activity.visualItems.length > 4 ? 3 : 2,
              childAspectRatio: 1.05,
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              children: List.generate(activity.visualItems.length, (index) {
                final value = activity.visualItems[index];
                final revealed = revealedCards.contains(index);
                return InkWell(
                  onTap: onReveal == null || revealed
                      ? null
                      : () => onReveal!(index, value),
                  borderRadius: BorderRadius.circular(22),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    decoration: BoxDecoration(
                      color: revealed ? color.withValues(alpha: 0.12) : color,
                      borderRadius: BorderRadius.circular(22),
                      border: Border.all(color: color, width: 2),
                    ),
                    child: Center(
                      child: revealed
                          ? _VisualToken(token: value, color: color)
                          : const Text(
                              '?',
                              style: TextStyle(
                                fontSize: 42,
                                color: Colors.white,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                    ),
                  ),
                );
              }),
            ),
          ],
        ),
      ),
    );
  }
}

class _OptionGrid extends StatelessWidget {
  const _OptionGrid({
    required this.activity,
    required this.color,
    required this.selected,
    required this.isCorrect,
    required this.onAnswer,
  });

  final LearningActivity activity;
  final Color color;
  final String? selected;
  final bool? isCorrect;
  final ValueChanged<String>? onAnswer;

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      crossAxisCount: 2,
      childAspectRatio: 2.2,
      mainAxisSpacing: 12,
      crossAxisSpacing: 12,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      children: activity.options.map((option) {
        final chosen = selected == option;
        return ElevatedButton(
          onPressed: onAnswer == null ? null : () => onAnswer!(option),
          style: ElevatedButton.styleFrom(
            backgroundColor: chosen
                ? (isCorrect == true ? AppColors.green : AppColors.red)
                : color,
            foregroundColor: Colors.white,
          ),
          child: Text(
            option,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900),
          ),
        );
      }).toList(),
    );
  }
}
