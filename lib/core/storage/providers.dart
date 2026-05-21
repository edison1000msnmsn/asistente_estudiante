import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../shared/models/app_settings.dart';
import '../../shared/models/child_profile.dart';
import 'app_repository.dart';

final appRepositoryProvider = Provider<AppRepository>((ref) => AppRepository());

final appStateProvider = StateNotifierProvider<AppStateNotifier, AppState>((
  ref,
) {
  return AppStateNotifier(ref.watch(appRepositoryProvider));
});

class AppState {
  const AppState({
    required this.profile,
    required this.settings,
    this.version = 0,
  });

  final ChildProfile? profile;
  final AppSettings settings;
  final int version;
}

class AppStateNotifier extends StateNotifier<AppState> {
  AppStateNotifier(this._repository)
    : super(
        AppState(
          profile: _repository.getProfile(),
          settings: _repository.getSettings(),
        ),
      );

  final AppRepository _repository;

  Future<void> saveProfile(
    String nickname,
    int age,
    String grade,
    String avatar,
  ) async {
    final profile = await _repository.saveProfile(
      nickname: nickname,
      age: age,
      grade: grade,
      avatar: avatar,
    );
    state = AppState(
      profile: profile,
      settings: state.settings,
      version: state.version + 1,
    );
  }

  Future<void> saveSettings(AppSettings settings) async {
    await _repository.saveSettings(settings);
    state = AppState(
      profile: state.profile,
      settings: settings,
      version: state.version + 1,
    );
  }

  Future<void> registerChange() async {
    state = AppState(
      profile: _repository.getProfile(),
      settings: _repository.getSettings(),
      version: state.version + 1,
    );
  }

  Future<void> resetProgress() async {
    final profile = state.profile;
    if (profile == null) return;
    await _repository.resetProgress(profile.id);
    await registerChange();
  }
}
