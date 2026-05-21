import 'package:flutter/material.dart';

class AppConstants {
  static const appName = 'AprendeJugando Kids';
  static const technicalName = 'aprendejugando_kids';
  static const adultDefaultPin = '1234';
}

class AppColors {
  static const purple = Color(0xFF7C5CBF);
  static const deepPurple = Color(0xFF4A148C);
  static const yellow = Color(0xFFFFD600);
  static const orange = Color(0xFFFF6D00);
  static const blue = Color(0xFF1E88E5);
  static const green = Color(0xFF43A047);
  static const pink = Color(0xFFE91E8C);
  static const red = Color(0xFFE53935);
  static const cream = Color(0xFFFFF9F0);
  static const lavender = Color(0xFFF3E5F5);
}

enum ModuleId { math, letters, art, logic }

extension ModuleIdX on ModuleId {
  String get id => name;

  String get label => switch (this) {
    ModuleId.math => 'Matematicas',
    ModuleId.letters => 'Letras',
    ModuleId.art => 'Arte',
    ModuleId.logic => 'Logica',
  };

  Color get color => switch (this) {
    ModuleId.math => AppColors.blue,
    ModuleId.letters => AppColors.green,
    ModuleId.art => AppColors.pink,
    ModuleId.logic => AppColors.orange,
  };

  IconData get icon => switch (this) {
    ModuleId.math => Icons.calculate_rounded,
    ModuleId.letters => Icons.menu_book_rounded,
    ModuleId.art => Icons.palette_rounded,
    ModuleId.logic => Icons.extension_rounded,
  };
}
