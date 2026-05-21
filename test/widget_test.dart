import 'dart:io';

import 'package:aprendejugando_kids/app/constants.dart';
import 'package:aprendejugando_kids/app/theme.dart';
import 'package:aprendejugando_kids/core/storage/local_storage_service.dart';
import 'package:aprendejugando_kids/features/reward/presentation/reward_screen.dart';
import 'package:aprendejugando_kids/shared/widgets/module_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';

void main() {
  setUpAll(() async {
    Hive.init(Directory.systemTemp.createTempSync('aprendejugando_test').path);
    await LocalStorageService.openBoxes();
  });

  tearDownAll(() async {
    await Hive.close();
  });

  testWidgets('tarjeta de modulo muestra titulo y progreso', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: buildAppTheme(),
        home: Scaffold(
          body: ModuleCard(
            title: 'Matematicas',
            subtitle: 'Nivel 1 de 10',
            icon: Icons.calculate_rounded,
            color: AppColors.blue,
            progress: 0.2,
            onTap: () {},
          ),
        ),
      ),
    );

    expect(find.text('Matematicas'), findsOneWidget);
    expect(find.byType(LinearProgressIndicator), findsOneWidget);
  });

  testWidgets('pantalla de recompensa muestra mensaje positivo', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: buildAppTheme(),
          home: const RewardScreen(module: ModuleId.math, success: true),
        ),
      ),
    );

    expect(find.text('¡Excelente trabajo!'), findsOneWidget);
  });
}
