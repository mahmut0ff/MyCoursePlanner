// ============================================================
// Planula — TypeScript Interfaces & Types
// Multi-Tenant SaaS Platform
// ============================================================

// ---- Roles ----

export type UserRole = 'super_admin' | 'admin' | 'teacher' | 'student';

// ---- Billing Plans ----

export type PlanId = 'starter' | 'professional' | 'enterprise';
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'cancelled' | 'suspended';
export type OrgStatus = 'active' | 'suspended' | 'deleted';

export interface Plan {
  id: PlanId;
  name: string;
  price: number; // monthly in USD
  features: string[];
  limits: PlanLimits;
}

export interface PlanLimits {
  maxStudents: number;   // -1 = unlimited
  maxTeachers: number;
  maxExams: number;
  aiEnabled: boolean;
  aiAnalytics: boolean;
  prioritySupport: boolean;
  dedicatedSupport: boolean;
  customBranding: boolean;
}

export const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: 39,
    features: [
      'Up to 50 students',
      'Up to 5 teachers',
      'Up to 20 exams',
      'Lesson plan management',
      'Exam rooms with live codes',
      'Auto-grading',
      'Email support',
    ],
    limits: { maxStudents: 50, maxTeachers: 5, maxExams: 20, aiEnabled: false, aiAnalytics: false, prioritySupport: false, dedicatedSupport: false, customBranding: false },
  },
  {
    id: 'professional',
    name: 'Professional',
    price: 79,
    features: [
      'Up to 200 students',
      'Up to 20 teachers',
      'Unlimited exams',
      'Everything in Starter',
      'AI feedback after exams',
      'Performance analytics',
      'Priority support',
    ],
    limits: { maxStudents: 200, maxTeachers: 20, maxExams: -1, aiEnabled: true, aiAnalytics: false, prioritySupport: true, dedicatedSupport: false, customBranding: false },
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 99,
    features: [
      'Unlimited students',
      'Unlimited teachers',
      'Unlimited exams',
      'Everything in Professional',
      'AI analytics & segment reports',
      'Custom branding',
      'Dedicated support manager',
      'API access',
    ],
    limits: { maxStudents: -1, maxTeachers: -1, maxExams: -1, aiEnabled: true, aiAnalytics: true, prioritySupport: true, dedicatedSupport: true, customBranding: true },
  },
];

// ---- Organizations (Tenants) ----

export interface Organization {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  ownerEmail: string;
  planId: PlanId;
  status: OrgStatus;
  studentsCount: number;
  teachersCount: number;
  examsCount: number;
  // Public profile fields
  description?: string;
  logo?: string;
  banner?: string;
  city?: string;
  country?: string;
  isOnline?: boolean;
  isPublic?: boolean;
  contactEmail?: string;
  contactPhone?: string;
  subjects?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Subscription {
  id: string;
  organizationId: string;
  planId: PlanId;
  status: SubscriptionStatus;
  startDate: string;
  currentPeriodEnd: string;
  trialEndsAt?: string;
  cancelledAt?: string;
  createdAt: string;
}

// ---- Users ----

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;                  // @deprecated — use membership role
  organizationId?: string;         // @deprecated — use activeOrgId
  organizationName?: string;       // @deprecated — use membership
  // Global identity fields
  activeOrgId?: string;            // currently selected org context
  avatarUrl?: string;
  bio?: string;
  skills?: string[];
  experience?: string;
  city?: string;
  country?: string;
  phone?: string;
  createdAt: string;
  updatedAt: string;
}

// ---- Memberships (User ↔ Organization) ----

export type MembershipRole = 'student' | 'teacher' | 'mentor' | 'admin' | 'owner';
export type MembershipStatus = 'pending' | 'invited' | 'active' | 'left' | 'removed';
export type JoinMethod = 'invited_by_org' | 'applied_by_user' | 'direct_added';

export interface Membership {
  id: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  organizationId: string;
  organizationName?: string;
  role: MembershipRole;
  status: MembershipStatus;
  joinMethod: JoinMethod;
  joinedAt: string;
  leftAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ---- XP Events (per-org gamification tracking) ----

export interface XpEvent {
  id: string;
  userId: string;
  organizationId?: string;
  courseId?: string;
  examId?: string;
  xp: number;
  reason: string; // e.g. 'exam_passed', 'perfect_score', 'streak_bonus'
  createdAt: string;
}

export interface TeacherProfile {
  uid: string;
  bio: string;
  specialization: string;
  experience: string;
  avatarUrl: string;
  socialLinks: { platform: string; url: string }[];
  updatedAt: string;
}

export interface Invite {
  id: string;
  email: string;
  role: string;
  organizationId: string;
  organizationName?: string;
  invitedBy: string;
  invitedByName?: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
}

// ---- Lesson Plans ----

export interface LessonPlan {
  id: string;
  title: string;
  description: string;
  subject: string;
  level: string;
  duration: number;
  tags: string[];
  coverImageUrl: string;
  videoUrl: string;
  content: LessonContentBlock[];
  authorId: string;
  authorName: string;
  organizationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LessonContentBlock {
  id: string;
  type: 'heading' | 'paragraph' | 'bulletList' | 'image' | 'video' | 'link';
  content: string;
  level?: number;
  items?: string[];
  url?: string;
  caption?: string;
}

// ---- Exams ----

export type ExamStatus = 'draft' | 'published' | 'archived';
export type QuestionType = 'single_choice' | 'multiple_choice' | 'text';

export interface Exam {
  id: string;
  title: string;
  description: string;
  subject: string;
  durationMinutes: number;
  passScore: number;
  randomizeQuestions: boolean;
  showResultsImmediately: boolean;
  status: ExamStatus;
  questionCount: number;
  authorId: string;
  authorName: string;
  organizationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  options: string[];
  correctAnswer: string;
  correctAnswers: string[];
  keywords: string[];
  points: number;
  order: number;
}

// ---- Exam Rooms ----

export type RoomStatus = 'active' | 'closed';

export interface ExamRoom {
  id: string;
  examId: string;
  examTitle: string;
  code: string;
  status: RoomStatus;
  hostId: string;
  hostName: string;
  participants: string[];
  organizationId?: string;
  startedAt: string;
  closedAt?: string;
  createdAt: string;
}

// ---- Exam Attempts ----

export interface ExamAttempt {
  id: string;
  examId: string;
  examTitle: string;
  roomId: string;
  roomCode: string;
  studentId: string;
  studentName: string;
  answers: Record<string, string | string[]>;
  questionResults: QuestionResult[];
  score: number;
  totalPoints: number;
  percentage: number;
  passed: boolean;
  organizationId?: string;
  startedAt: string;
  submittedAt: string;
  timeSpentSeconds: number;
  aiFeedback?: AIFeedback;
  createdAt: string;
}

export interface QuestionResult {
  questionId: string;
  questionText: string;
  type: QuestionType;
  studentAnswer: string | string[];
  correctAnswer: string | string[];
  isCorrect: boolean;
  pointsEarned: number;
  pointsPossible: number;
  status: 'correct' | 'incorrect' | 'pending_review';
}

// ---- AI Feedback ----

export interface AIFeedback {
  strengths: string[];
  weakTopics: string[];
  reviewSuggestions: string[];
  summary: string;
  generatedAt: string;
}

// ---- System Logs ----

export interface SystemLog {
  id: string;
  action: string;
  actorId: string;
  actorName: string;
  targetType: 'org' | 'user' | 'subscription' | 'system';
  targetId: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

// ---- Platform Stats (Super Admin) ----

export interface PlatformStats {
  totalOrganizations: number;
  activeOrganizations: number;
  totalUsers: number;
  totalStudents: number;
  totalExams: number;
  totalAttempts: number;
  monthlyRevenue: number;
  trialOrgs: number;
}

// ---- Dashboard Stats ----

export interface DashboardStats {
  totalLessons: number;
  totalExams: number;
  activeRooms: number;
  totalStudents: number;
  totalAttempts: number;
  totalCourses?: number;
  totalGroups?: number;
  totalTeachers?: number;
}

// ---- Courses ----

export type CourseStatus = 'draft' | 'published' | 'archived';

export interface Course {
  id: string;
  organizationId: string;
  title: string;
  description: string;
  subject: string;
  teacherIds: string[];
  lessonIds: string[];
  status: CourseStatus;
  coverImageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

// ---- Groups ----

export interface Group {
  id: string;
  organizationId: string;
  courseId: string;
  courseName?: string;
  name: string;
  studentIds: string[];
  createdAt: string;
  updatedAt: string;
}

// ---- Materials ----

export type MaterialType = 'link' | 'file' | 'video' | 'document';

export interface Material {
  id: string;
  organizationId: string;
  title: string;
  type: MaterialType;
  url: string;
  category: string;
  lessonId?: string;
  courseId?: string;
  authorId: string;
  authorName: string;
  createdAt: string;
}

// ---- Schedule Events ----

export type ScheduleEventType = 'lesson' | 'exam' | 'other';

export interface ScheduleEvent {
  id: string;
  organizationId: string;
  type: ScheduleEventType;
  title: string;
  groupId?: string;
  groupName?: string;
  courseId?: string;
  courseName?: string;
  teacherId?: string;
  teacherName?: string;
  examId?: string;
  lessonId?: string;
  date: string;        // YYYY-MM-DD
  startTime: string;   // HH:mm
  endTime: string;     // HH:mm
  duration: number;    // minutes
  location?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ---- Organization Settings ----

export interface OrgSettings {
  organizationId: string;
  name: string;
  logo?: string;
  timezone: string;
  locale: string;
  academicYearStart?: string;
  academicYearEnd?: string;
  gradingScale?: 'percentage' | 'letter' | 'points';
  passingScore: number;
  // Notifications
  emailNotifications?: boolean;
  pushNotifications?: boolean;
  // Security
  requireTwoFactor?: boolean;
  sessionTimeoutMinutes?: number;
  // Branding
  primaryColor?: string;
  description?: string;
  // Limits (read-only from subscription)
  maxStudents?: number;
  maxTeachers?: number;
  storageUsedMb?: number;
  updatedAt: string;
}

// ---- Vacancies ----

export type VacancyStatus = 'draft' | 'published' | 'closed';
export type VacancyEmploymentType = 'full_time' | 'part_time' | 'contract' | 'freelance';
export type VacancyApplicationStatus = 'pending' | 'viewed' | 'accepted' | 'rejected';

export interface VacancyLocation {
  city: string;
  country: string;
  address?: string;
  lat?: number;
  lng?: number;
  remote: boolean;
}

export interface Vacancy {
  id: string;
  organizationId: string;
  organizationName: string;
  title: string;
  description: string;
  requirements: string;
  responsibilities: string;
  subject: string;
  employmentType: VacancyEmploymentType;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency: string;
  location: VacancyLocation;
  workConditions: string;
  benefits: string[];
  photos: string[];
  contactEmail: string;
  contactPhone?: string;
  status: VacancyStatus;
  applicationsCount: number;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
}

export interface VacancyApplication {
  id: string;
  vacancyId: string;
  vacancyTitle: string;
  organizationName: string;
  teacherId: string;
  teacherName: string;
  teacherEmail: string;
  coverLetter: string;
  resumeUrl?: string;
  status: VacancyApplicationStatus;
  reviewedAt?: string;
  reviewedBy?: string;
  createdAt: string;
}

// ---- Notifications ----

export type NotificationType =
  | 'invite_received'
  | 'vacancy_app_reviewed'
  | 'added_to_group'
  | 'new_vacancy_application'
  | 'invite_accepted'
  | 'invite_declined'
  | 'exam_room_created'
  | 'exam_result_ready'
  | 'new_lesson'
  | 'new_org_registered';

export interface AppNotification {
  id: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  metadata?: Record<string, any>;
  read: boolean;
  createdAt: string;
}

// ============================================================
// QUIZ SYSTEM (Kahoot-like Live Quizzes)
// ============================================================

// ---- Enums ----

export type QuizVisibility = 'private' | 'organization' | 'platform' | 'public';
export type QuizStatus = 'draft' | 'published' | 'archived';

export type QuizQuestionType =
  | 'single_choice'
  | 'multiple_choice'
  | 'true_false'
  | 'multi_select'
  | 'short_text'
  | 'poll'
  | 'ordering'
  | 'matching'
  | 'image_question'
  | 'audio_question'
  | 'pdf_question'
  | 'passage_question'
  | 'info_slide'
  | 'discussion'
  | 'puzzle';

export type QuizSessionStatus =
  | 'draft'
  | 'scheduled'
  | 'lobby'
  | 'in_progress'
  | 'paused'
  | 'completed'
  | 'cancelled';

export type QuizSessionMode = 'competition' | 'practice';

export type QuizDifficulty = 'easy' | 'medium' | 'hard' | 'expert';

export type QuizSharePermission = 'view' | 'copy' | 'edit';
export type QuizShareType = 'organization' | 'platform' | 'specific_user';

// ---- Quiz ----

export interface Quiz {
  id: string;
  title: string;
  subtitle?: string;
  description: string;
  coverImageUrl?: string;
  tags: string[];
  subject: string;
  category?: string;
  difficulty: QuizDifficulty;
  estimatedMinutes: number;
  language: string;
  visibility: QuizVisibility;
  status: QuizStatus;
  questionCount: number;

  // Ownership
  authorId: string;
  authorName: string;
  organizationId?: string;

  // Fork / lineage
  forkedFromId?: string;
  originalAuthorId?: string;
  originalAuthorName?: string;

  // Stats
  timesPlayed: number;
  avgScore: number;
  rating: number;
  ratingCount: number;

  createdAt: string;
  updatedAt: string;
}

// ---- Quiz Question ----

export interface MatchingPair {
  left: string;
  right: string;
}

export interface QuizQuestionOption {
  id: string;
  text: string;
  imageUrl?: string;
}

export interface QuizQuestion {
  id: string;
  quizId: string;
  type: QuizQuestionType;
  order: number;

  // Content
  text: string;
  helpText?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'audio' | 'pdf' | 'video';
  passageText?: string;

  // Answers
  options: QuizQuestionOption[];
  correctAnswers: string[]; // option IDs or text values
  distractorExplanations?: Record<string, string>; // optionId → explanation
  answerExplanation?: string;

  // Matching / Ordering
  matchingPairs?: MatchingPair[];
  orderingSequence?: string[]; // correct order of option IDs

  // Scoring
  timerSeconds: number;
  points: number;
  bonusPoints?: number;
  negativeScore?: number;
  difficulty?: QuizDifficulty;
  tags?: string[];
}

// ---- Quiz Session ----

export interface QuizSessionSettings {
  randomizeQuestions: boolean;
  randomizeAnswers: boolean;
  showLeaderboard: boolean;
  showAnswerCorrectness: boolean;
  teamMode: boolean;
  anonymousMode: boolean;
  allowedGroupIds?: string[];
  restrictToOrg: boolean;
  timerOverride?: number; // override per-question timer (seconds)
}

export interface QuizSession {
  id: string;
  quizId: string;
  quizTitle: string;
  hostId: string;
  hostName: string;
  code: string; // 6-char join code
  status: QuizSessionStatus;
  mode: QuizSessionMode;

  currentQuestionIndex: number;
  totalQuestions: number;
  currentQuestionStartedAt?: string;

  settings: QuizSessionSettings;

  participantCount: number;
  organizationId?: string;

  // Ordered question IDs (may be shuffled)
  questionOrder: string[];

  startedAt?: string;
  pausedAt?: string;
  completedAt?: string;
  createdAt: string;
}

// ---- Session Participant ----

export interface SessionParticipant {
  id: string; // same as participantId (the user uid)
  sessionId: string;
  participantId: string;
  participantName: string;

  score: number;
  correctCount: number;
  incorrectCount: number;
  streakCurrent: number;
  streakBest: number;
  rank?: number;

  joinedAt: string;
  lastActiveAt: string;
  isConnected: boolean;
}

// ---- Session Answer ----

export interface SessionAnswer {
  id: string;
  sessionId: string;
  questionId: string;
  participantId: string;
  participantName: string;

  answer: string | string[];
  isCorrect: boolean;
  pointsEarned: number;
  speedBonusEarned: number;
  streakBonusEarned: number;
  responseTimeMs: number;

  submittedAt: string;
}

// ---- Quiz Sharing ----

export interface QuizShare {
  id: string;
  quizId: string;
  quizTitle: string;
  sharedByUserId: string;
  sharedByUserName: string;
  shareType: QuizShareType;
  targetOrganizationId?: string;
  targetUserId?: string;
  targetUserName?: string;
  permissions: QuizSharePermission;
  createdAt: string;
}

// ---- Quiz Analytics ----

export interface QuestionStat {
  questionId: string;
  questionText: string;
  correctRate: number;
  avgResponseTimeMs: number;
  totalAnswers: number;
}

export interface QuizAnalytics {
  quizId: string;
  totalPlays: number;
  uniquePlayers: number;
  avgScore: number;
  avgCompletionRate: number;
  hardestQuestionId?: string;
  easiestQuestionId?: string;
  questionStats: QuestionStat[];
  lastPlayedAt?: string;
  updatedAt: string;
}
