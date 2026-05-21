import '../../shared/models/achievement.dart';
import '../../shared/models/module_progress.dart';

class GamificationService {
  static int starsForAttempt({
    required bool isCorrect,
    required bool activityCompleted,
    required bool levelCompleted,
  }) {
    var stars = isCorrect ? 10 : 0;
    if (activityCompleted) stars += 30;
    if (levelCompleted) stars += 50;
    return stars;
  }

  static bool shouldUnlockMedal(ModuleProgress progress) {
    return progress.currentLevel >= ModuleProgress.maxLevel &&
        progress.completedActivities >= ModuleProgress.totalActivities;
  }

  static Achievement moduleMedal(String moduleId) => Achievement(
    id: 'medal_$moduleId',
    name: 'Medalla ${moduleId.toUpperCase()}',
    description: 'Completaste retos importantes del modulo.',
    icon: '🏅',
    unlocked: true,
    unlockedAt: DateTime.now(),
  );

  static int totalStars(Iterable<ModuleProgress> progress) {
    return progress.fold<int>(0, (sum, item) => sum + item.stars);
  }

  static int globalLevel(int totalStars) {
    return (1 + (totalStars ~/ 150)).clamp(1, 20);
  }
}
