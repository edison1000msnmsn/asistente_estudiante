class ChildProfile {
  const ChildProfile({
    required this.id,
    required this.nickname,
    required this.age,
    required this.grade,
    required this.avatar,
    required this.createdAt,
  });

  final String id;
  final String nickname;
  final int age;
  final String grade;
  final String avatar;
  final DateTime createdAt;

  Map<String, dynamic> toJson() => {
    'id': id,
    'nickname': nickname,
    'age': age,
    'grade': grade,
    'avatar': avatar,
    'createdAt': createdAt.toIso8601String(),
  };

  factory ChildProfile.fromJson(Map<dynamic, dynamic> json) => ChildProfile(
    id: json['id'] as String,
    nickname: json['nickname'] as String,
    age: json['age'] as int,
    grade: json['grade'] as String,
    avatar: json['avatar'] as String,
    createdAt: DateTime.parse(json['createdAt'] as String),
  );

  ChildProfile copyWith({
    String? nickname,
    int? age,
    String? grade,
    String? avatar,
  }) {
    return ChildProfile(
      id: id,
      nickname: nickname ?? this.nickname,
      age: age ?? this.age,
      grade: grade ?? this.grade,
      avatar: avatar ?? this.avatar,
      createdAt: createdAt,
    );
  }
}
