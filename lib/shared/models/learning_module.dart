class LearningModule {
  const LearningModule({
    required this.id,
    required this.name,
    required this.description,
    required this.icon,
    required this.color,
    required this.totalLevels,
  });

  final String id;
  final String name;
  final String description;
  final String icon;
  final int color;
  final int totalLevels;
}
