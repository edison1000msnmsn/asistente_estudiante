import 'package:hive/hive.dart';
import 'package:uuid/uuid.dart';

import '../../app/constants.dart';
import '../../shared/models/activity_attempt.dart';
import '../../shared/models/achievement.dart';
import '../../shared/models/app_settings.dart';
import '../../shared/models/child_profile.dart';
import '../../shared/models/module_progress.dart';
import '../gamification/gamification_service.dart';
import 'local_storage_service.dart';

class AppRepository {
  AppRepository({
    Uuid? uuid,
    Box<dynamic>? profileBox,
    Box<dynamic>? progressBox,
    Box<dynamic>? attemptsBox,
    Box<dynamic>? achievementsBox,
    Box<dynamic>? settingsBox,
    Box<dynamic>? sessionBox,
  }) : _uuid = uuid ?? const Uuid(),
       _profileBox =
           profileBox ??
           LocalStorageService.box(LocalStorageService.profileBox),
       _progressBox =
           progressBox ??
           LocalStorageService.box(LocalStorageService.progressBox),
       _attemptsBox =
           attemptsBox ??
           LocalStorageService.box(LocalStorageService.attemptsBox),
       _achievementsBox =
           achievementsBox ??
           LocalStorageService.box(LocalStorageService.achievementsBox),
       _settingsBox =
           settingsBox ??
           LocalStorageService.box(LocalStorageService.settingsBox),
       _sessionBox =
           sessionBox ??
           LocalStorageService.box(LocalStorageService.sessionBox);

  final Uuid _uuid;
  final Box<dynamic> _profileBox;
  final Box<dynamic> _progressBox;
  final Box<dynamic> _attemptsBox;
  final Box<dynamic> _achievementsBox;
  final Box<dynamic> _settingsBox;
  final Box<dynamic> _sessionBox;

  ChildProfile? getProfile() {
    final data = _profileBox.get('active');
    if (data == null) return null;
    return ChildProfile.fromJson(Map<dynamic, dynamic>.from(data as Map));
  }

  Future<ChildProfile> saveProfile({
    required String nickname,
    required int age,
    required String grade,
    required String avatar,
  }) async {
    final current = getProfile();
    final profile = current == null
        ? ChildProfile(
            id: _uuid.v4(),
            nickname: nickname,
            age: age,
            grade: grade,
            avatar: avatar,
            createdAt: DateTime.now(),
          )
        : current.copyWith(
            nickname: nickname,
            age: age,
            grade: grade,
            avatar: avatar,
          );
    await _profileBox.put('active', profile.toJson());
    for (final module in ModuleId.values) {
      final key = _progressKey(profile.id, module.id);
      _progressBox.put(
        key,
        _progressBox.get(key) ??
            ModuleProgress.initial(profile.id, module.id).toJson(),
      );
    }
    return profile;
  }

  AppSettings getSettings() {
    final data = _settingsBox.get('settings');
    if (data == null) return AppSettings.defaults();
    return AppSettings.fromJson(Map<dynamic, dynamic>.from(data as Map));
  }

  Future<void> saveSettings(AppSettings settings) =>
      _settingsBox.put('settings', settings.toJson());

  List<ModuleProgress> getAllProgress(String profileId) {
    return ModuleId.values
        .map((module) => getProgress(profileId, module.id))
        .toList();
  }

  ModuleProgress getProgress(String profileId, String moduleId) {
    final data = _progressBox.get(_progressKey(profileId, moduleId));
    if (data == null) return ModuleProgress.initial(profileId, moduleId);
    return ModuleProgress.fromJson(Map<dynamic, dynamic>.from(data as Map));
  }

  Future<ActivityAttempt> registerAttempt({
    required String profileId,
    required String activityId,
    required String moduleId,
    required String selectedAnswer,
    required bool isCorrect,
    required int timeSpentSeconds,
  }) async {
    final attempt = ActivityAttempt(
      id: _uuid.v4(),
      profileId: profileId,
      activityId: activityId,
      moduleId: moduleId,
      selectedAnswer: selectedAnswer,
      isCorrect: isCorrect,
      timeSpentSeconds: timeSpentSeconds,
      createdAt: DateTime.now(),
    );
    await _attemptsBox.put(attempt.id, attempt.toJson());

    final current = getProgress(profileId, moduleId);
    final earnedStars = GamificationService.starsForAttempt(
      isCorrect: isCorrect,
      activityCompleted: isCorrect,
      levelCompleted:
          isCorrect &&
          current.completedActivities > 0 &&
          (current.completedActivities + 1) %
                  ModuleProgress.activitiesPerLevel ==
              0,
    );
    final next = current.registerAttempt(
      correct: isCorrect,
      earnedStars: earnedStars,
    );
    await _progressBox.put(_progressKey(profileId, moduleId), next.toJson());

    if (GamificationService.shouldUnlockMedal(next)) {
      final medal = GamificationService.moduleMedal(moduleId);
      await _achievementsBox.put(medal.id, medal.toJson());
    }
    _sessionBox.put('lastSession', DateTime.now().toIso8601String());
    _sessionBox.put('totalSeconds', totalUsageSeconds + timeSpentSeconds);
    return attempt;
  }

  List<ActivityAttempt> attemptsFor(String profileId) {
    return _attemptsBox.values
        .whereType<Map>()
        .map(
          (data) => ActivityAttempt.fromJson(Map<dynamic, dynamic>.from(data)),
        )
        .where((attempt) => attempt.profileId == profileId)
        .toList();
  }

  List<Achievement> achievements() {
    return _achievementsBox.values
        .whereType<Map>()
        .map((data) => Achievement.fromJson(Map<dynamic, dynamic>.from(data)))
        .toList();
  }

  int get totalUsageSeconds => (_sessionBox.get('totalSeconds') as int?) ?? 0;

  DateTime? get lastSession {
    final value = _sessionBox.get('lastSession') as String?;
    return value == null ? null : DateTime.parse(value);
  }

  Future<void> resetProgress(String profileId) async {
    for (final module in ModuleId.values) {
      await _progressBox.put(
        _progressKey(profileId, module.id),
        ModuleProgress.initial(profileId, module.id).toJson(),
      );
    }
    await _attemptsBox.clear();
    await _achievementsBox.clear();
    await _sessionBox.clear();
  }

  String exportProgressJson(String profileId) {
    final progress = getAllProgress(
      profileId,
    ).map((item) => item.toJson()).toList();
    final attempts = attemptsFor(
      profileId,
    ).map((item) => item.toJson()).toList();
    return {
      'profileId': profileId,
      'progress': progress,
      'attempts': attempts,
    }.toString();
  }

  String _progressKey(String profileId, String moduleId) =>
      '$profileId-$moduleId';
}
