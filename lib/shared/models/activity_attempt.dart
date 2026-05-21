class ActivityAttempt {
  const ActivityAttempt({
    required this.id,
    required this.profileId,
    required this.activityId,
    required this.moduleId,
    required this.selectedAnswer,
    required this.isCorrect,
    required this.timeSpentSeconds,
    required this.createdAt,
  });

  final String id;
  final String profileId;
  final String activityId;
  final String moduleId;
  final String selectedAnswer;
  final bool isCorrect;
  final int timeSpentSeconds;
  final DateTime createdAt;

  Map<String, dynamic> toJson() => {
    'id': id,
    'profileId': profileId,
    'activityId': activityId,
    'moduleId': moduleId,
    'selectedAnswer': selectedAnswer,
    'isCorrect': isCorrect,
    'timeSpentSeconds': timeSpentSeconds,
    'createdAt': createdAt.toIso8601String(),
  };

  factory ActivityAttempt.fromJson(Map<dynamic, dynamic> json) =>
      ActivityAttempt(
        id: json['id'] as String,
        profileId: json['profileId'] as String,
        activityId: json['activityId'] as String,
        moduleId: json['moduleId'] as String,
        selectedAnswer: json['selectedAnswer'] as String,
        isCorrect: json['isCorrect'] as bool,
        timeSpentSeconds: json['timeSpentSeconds'] as int,
        createdAt: DateTime.parse(json['createdAt'] as String),
      );
}
