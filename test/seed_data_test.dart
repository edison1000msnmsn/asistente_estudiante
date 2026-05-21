import 'package:aprendejugando_kids/app/constants.dart';
import 'package:aprendejugando_kids/shared/models/seed_data.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('cada modulo tiene al menos 20 retos y llega a nivel 10', () {
    for (final module in ModuleId.values) {
      final activities = SeedData.byModule(module);

      expect(activities.length, greaterThanOrEqualTo(20));
      expect(activities.map((item) => item.level).contains(10), isTrue);
    }
  });
}
