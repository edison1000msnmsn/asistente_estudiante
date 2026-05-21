import 'package:go_router/go_router.dart';

import '../features/academic_info/presentation/academic_info_screen.dart';
import '../features/activity_screen.dart';
import '../features/home/presentation/home_screen.dart';
import '../features/level_up_screen.dart';
import '../features/onboarding/presentation/onboarding_screen.dart';
import '../features/parent_dashboard/presentation/parent_dashboard_screen.dart';
import '../features/profile/presentation/profile_screen.dart';
import '../features/progress/presentation/progress_screen.dart';
import '../features/reward/presentation/reward_screen.dart';
import '../features/settings/presentation/settings_screen.dart';
import '../features/splash_screen.dart';
import '../features/world_map/presentation/world_map_screen.dart';
import 'constants.dart';

final appRouter = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(path: '/', builder: (context, state) => const SplashScreen()),
    GoRoute(
      path: '/onboarding',
      builder: (context, state) => const OnboardingScreen(),
    ),
    GoRoute(
      path: '/profile',
      builder: (context, state) => const ProfileScreen(),
    ),
    GoRoute(path: '/home', builder: (context, state) => const HomeScreen()),
    GoRoute(
      path: '/module/:module',
      builder: (context, state) =>
          ActivityScreen(module: _moduleFrom(state.pathParameters['module'])),
    ),
    GoRoute(
      path: '/reward/:module/:success',
      builder: (context, state) => RewardScreen(
        module: _moduleFrom(state.pathParameters['module']),
        success: state.pathParameters['success'] == '1',
      ),
    ),
    GoRoute(
      path: '/progress',
      builder: (context, state) => const ProgressScreen(),
    ),
    GoRoute(
      path: '/parent',
      builder: (context, state) => const ParentDashboardScreen(),
    ),
    GoRoute(
      path: '/settings',
      builder: (context, state) => const SettingsScreen(),
    ),
    GoRoute(
      path: '/world-map',
      builder: (context, state) => const WorldMapScreen(),
    ),
    GoRoute(
      path: '/level-up',
      builder: (context, state) => const LevelUpScreen(),
    ),
    GoRoute(
      path: '/academic',
      builder: (context, state) => const AcademicInfoScreen(),
    ),
  ],
);

ModuleId _moduleFrom(String? id) {
  return ModuleId.values.firstWhere(
    (module) => module.id == id,
    orElse: () => ModuleId.math,
  );
}
