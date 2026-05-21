import 'package:flutter/material.dart';

import 'constants.dart';
import 'router.dart';
import 'theme.dart';

class AprendeJugandoApp extends StatelessWidget {
  const AprendeJugandoApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: AppConstants.appName,
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      routerConfig: appRouter,
    );
  }
}
