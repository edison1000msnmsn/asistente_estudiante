class ModuleProgress {
  static const maxLevel = 10;
  static const activitiesPerLevel = 2;
  static const totalActivities = maxLevel * activitiesPerLevel;

  const ModuleProgress({
    required this.profileId,
    required this.moduleId,
    required this.currentLevel,
    required this.stars,
    required this.completedActivities,
    required this.correctAnswers,
    required this.wrongAnswers,
  });

  final String profileId;
  final String moduleId;
  final int currentLevel;
  final int stars;
  final int completedActivities;
  final int correctAnswers;
  final int wrongAnswers;

  double get accuracyPercentage {
    final total = correctAnswers + wrongAnswers;
    if (total == 0) return 0;
    return (correctAnswers / total) * 100;
  }

  double progressPercentage(int totalLevels) {
    if (totalLevels == 0) return 0;
    return (completedActivities / totalActivities).clamp(0, 1).toDouble() * 100;
  }

  Map<String, dynamic> toJson() => {
    'profileId': profileId,
    'moduleId': moduleId,
    'currentLevel': currentLevel,
    'stars': stars,
    'completedActivities': completedActivities,
    'correctAnswers': correctAnswers,
    'wrongAnswers': wrongAnswers,
  };

  factory ModuleProgress.fromJson(Map<dynamic, dynamic> json) {
    final completedActivities = json['completedActivities'] as int;
    return ModuleProgress(
      profileId: json['profileId'] as String,
      moduleId: json['moduleId'] as String,
      currentLevel: levelForCompleted(completedActivities),
      stars: json['stars'] as int,
      completedActivities: completedActivities,
      correctAnswers: json['correctAnswers'] as int,
      wrongAnswers: json['wrongAnswers'] as int,
    );
  }

  factory ModuleProgress.initial(String profileId, String moduleId) =>
      ModuleProgress(
        profileId: profileId,
        moduleId: moduleId,
        currentLevel: 1,
        stars: 0,
        completedActivities: 0,
        correctAnswers: 0,
        wrongAnswers: 0,
      );

  ModuleProgress registerAttempt({
    required bool correct,
    required int earnedStars,
  }) {
    final nextCompleted = completedActivities + (correct ? 1 : 0);
    final nextLevel = levelForCompleted(nextCompleted);
    return ModuleProgress(
      profileId: profileId,
      moduleId: moduleId,
      currentLevel: nextLevel,
      stars: stars + earnedStars,
      completedActivities: nextCompleted,
      correctAnswers: correctAnswers + (correct ? 1 : 0),
      wrongAnswers: wrongAnswers + (correct ? 0 : 1),
    );
  }

  static int levelForCompleted(int completedActivities) {
    final safeCompleted = completedActivities.clamp(0, totalActivities);
    if (safeCompleted >= totalActivities) return maxLevel;
    return (1 + (safeCompleted ~/ activitiesPerLevel)).clamp(1, maxLevel);
  }
}
