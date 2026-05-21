import 'package:aprendejugando_kids/core/gamification/gamification_service.dart';
import 'package:aprendejugando_kids/shared/models/learning_activity.dart';
import 'package:aprendejugando_kids/shared/models/module_progress.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('calcula estrellas por respuesta y cierre de nivel', () {
    final stars = GamificationService.starsForAttempt(
      isCorrect: true,
      activityCompleted: true,
      levelCompleted: true,
    );

    expect(stars, 90);
  });

  test('calcula porcentaje de precision', () {
    const progress = ModuleProgress(
      profileId: 'p1',
      moduleId: 'math',
      currentLevel: 2,
      stars: 70,
      completedActivities: 4,
      correctAnswers: 3,
      wrongAnswers: 1,
    );

    expect(progress.accuracyPercentage, 75);
  });

  test('registra intento y avance local de progreso', () {
    final progress = ModuleProgress.initial(
      'p1',
      'letters',
    ).registerAttempt(correct: true, earnedStars: 40);

    expect(progress.completedActivities, 1);
    expect(progress.correctAnswers, 1);
    expect(progress.stars, 40);
    expect(progress.currentLevel, 1);
  });

  test('sube un nivel cada dos actividades correctas', () {
    final progress = ModuleProgress.initial('p1', 'math')
        .registerAttempt(correct: true, earnedStars: 40)
        .registerAttempt(correct: true, earnedStars: 90);

    expect(progress.completedActivities, 2);
    expect(progress.currentLevel, 2);
  });

  test(
    'normaliza niveles guardados antiguos segun actividades completadas',
    () {
      final progress = ModuleProgress.fromJson({
        'profileId': 'p1',
        'moduleId': 'math',
        'currentLevel': 9,
        'stars': 100,
        'completedActivities': 3,
        'correctAnswers': 3,
        'wrongAnswers': 0,
      });

      expect(progress.currentLevel, 2);
    },
  );

  test('valida respuestas de actividad', () {
    const activity = LearningActivity(
      id: 'a1',
      moduleId: 'math',
      level: 1,
      type: 'conteo',
      question: 'Cuantas hay?',
      options: ['1', '2', '3', '4'],
      correctAnswer: '3',
      explanation: 'Hay 3.',
      visualItems: ['⭐', '⭐', '⭐'],
    );

    expect(activity.validate('3'), isTrue);
    expect(activity.validate('2'), isFalse);
  });
}
