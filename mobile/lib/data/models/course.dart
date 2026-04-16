/// Course model — maps to Firestore `courses/{id}`.
class Course {
  final String id;
  final String organizationId;
  final String? branchId;
  final String title;
  final String description;
  final String subject;
  final List<String> teacherIds;
  final List<String> lessonIds;
  final String? syllabusId;
  final String status; // draft | published | archived
  final String? coverImageUrl;
  final double? price;
  final String? paymentFormat; // one-time | monthly
  final int? durationMonths;
  final String? createdAt;
  final String? updatedAt;

  const Course({
    required this.id,
    required this.organizationId,
    this.branchId,
    required this.title,
    this.description = '',
    this.subject = '',
    this.teacherIds = const [],
    this.lessonIds = const [],
    this.syllabusId,
    this.status = 'draft',
    this.coverImageUrl,
    this.price,
    this.paymentFormat,
    this.durationMonths,
    this.createdAt,
    this.updatedAt,
  });

  factory Course.fromMap(Map<String, dynamic> data) {
    return Course(
      id: data['id'] ?? '',
      organizationId: data['organizationId'] ?? '',
      branchId: data['branchId'],
      title: data['title'] ?? '',
      description: data['description'] ?? '',
      subject: data['subject'] ?? '',
      teacherIds: List<String>.from(data['teacherIds'] ?? []),
      lessonIds: List<String>.from(data['lessonIds'] ?? []),
      syllabusId: data['syllabusId'],
      status: data['status'] ?? 'draft',
      coverImageUrl: data['coverImageUrl'],
      price: (data['price'] as num?)?.toDouble(),
      paymentFormat: data['paymentFormat'],
      durationMonths: data['durationMonths'],
      createdAt: data['createdAt'],
      updatedAt: data['updatedAt'],
    );
  }

  int get lessonCount => lessonIds.length;
  bool get isFree => price == null || price! <= 0;
  bool get isPublished => status == 'published';
}
