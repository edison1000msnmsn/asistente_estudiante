class PrePostTestRecord {
  const PrePostTestRecord({
    required this.profileId,
    required this.testType,
    required this.mathScore,
    required this.lettersScore,
    required this.logicScore,
    required this.date,
  });

  final String profileId;
  final String testType;
  final int mathScore;
  final int lettersScore;
  final int logicScore;
  final DateTime date;
}
