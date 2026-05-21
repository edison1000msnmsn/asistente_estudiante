class LearningActivity {
  const LearningActivity({
    required this.id,
    required this.moduleId,
    required this.level,
    required this.type,
    required this.question,
    required this.options,
    required this.correctAnswer,
    required this.explanation,
    required this.visualItems,
  });

  final String id;
  final String moduleId;
  final int level;
  final String type;
  final String question;
  final List<String> options;
  final String correctAnswer;
  final String explanation;
  final List<String> visualItems;

  bool validate(String selectedAnswer) => selectedAnswer == correctAnswer;
}
