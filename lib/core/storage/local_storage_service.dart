import 'package:hive/hive.dart';

class LocalStorageService {
  static const profileBox = 'profiles';
  static const progressBox = 'progress';
  static const attemptsBox = 'attempts';
  static const achievementsBox = 'achievements';
  static const settingsBox = 'settings';
  static const sessionBox = 'sessions';

  static Future<void> openBoxes() async {
    await Future.wait([
      Hive.openBox<dynamic>(profileBox),
      Hive.openBox<dynamic>(progressBox),
      Hive.openBox<dynamic>(attemptsBox),
      Hive.openBox<dynamic>(achievementsBox),
      Hive.openBox<dynamic>(settingsBox),
      Hive.openBox<dynamic>(sessionBox),
    ]);
  }

  static Box<dynamic> box(String name) => Hive.box<dynamic>(name);
}
