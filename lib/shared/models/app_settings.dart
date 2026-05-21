class AppSettings {
  const AppSettings({
    required this.soundEnabled,
    required this.musicEnabled,
    required this.adultPin,
    required this.maxSessionMinutes,
    this.darkMode = false,
  });

  final bool soundEnabled;
  final bool musicEnabled;
  final String adultPin;
  final int maxSessionMinutes;
  final bool darkMode;

  Map<String, dynamic> toJson() => {
    'soundEnabled': soundEnabled,
    'musicEnabled': musicEnabled,
    'adultPin': adultPin,
    'maxSessionMinutes': maxSessionMinutes,
    'darkMode': darkMode,
  };

  factory AppSettings.fromJson(Map<dynamic, dynamic> json) => AppSettings(
    soundEnabled: json['soundEnabled'] as bool,
    musicEnabled: json['musicEnabled'] as bool,
    adultPin: json['adultPin'] as String,
    maxSessionMinutes: json['maxSessionMinutes'] as int,
    darkMode: (json['darkMode'] as bool?) ?? false,
  );

  factory AppSettings.defaults() => const AppSettings(
    soundEnabled: true,
    musicEnabled: true,
    adultPin: '1234',
    maxSessionMinutes: 15,
  );

  AppSettings copyWith({
    bool? soundEnabled,
    bool? musicEnabled,
    String? adultPin,
    int? maxSessionMinutes,
    bool? darkMode,
  }) {
    return AppSettings(
      soundEnabled: soundEnabled ?? this.soundEnabled,
      musicEnabled: musicEnabled ?? this.musicEnabled,
      adultPin: adultPin ?? this.adultPin,
      maxSessionMinutes: maxSessionMinutes ?? this.maxSessionMinutes,
      darkMode: darkMode ?? this.darkMode,
    );
  }
}
