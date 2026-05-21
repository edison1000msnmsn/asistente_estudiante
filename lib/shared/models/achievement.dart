class Achievement {
  const Achievement({
    required this.id,
    required this.name,
    required this.description,
    required this.icon,
    required this.unlocked,
    this.unlockedAt,
  });

  final String id;
  final String name;
  final String description;
  final String icon;
  final bool unlocked;
  final DateTime? unlockedAt;

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'description': description,
    'icon': icon,
    'unlocked': unlocked,
    'unlockedAt': unlockedAt?.toIso8601String(),
  };

  factory Achievement.fromJson(Map<dynamic, dynamic> json) => Achievement(
    id: json['id'] as String,
    name: json['name'] as String,
    description: json['description'] as String,
    icon: json['icon'] as String,
    unlocked: json['unlocked'] as bool,
    unlockedAt: json['unlockedAt'] == null
        ? null
        : DateTime.parse(json['unlockedAt'] as String),
  );
}
