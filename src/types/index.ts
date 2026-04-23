// ============================================================
// Planula — TypeScript Interfaces & Types
// Multi-Tenant SaaS Platform
// ============================================================

// ---- Roles ----

export type UserRole = 'super_admin' | 'admin' | 'manager' | 'teacher' | 'student';

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
  // Feature gating
  financesEnabled: boolean;
  gradebookEnabled: boolean;
  certificatesEnabled: boolean;
  branchesEnabled: boolean;
  advancedAnalytics: boolean;

}

/** Canonical feature keys for plan gating */
export type PlanFeature =
  | 'finances' | 'gradebook' | 'certificates'
  | 'branches' | 'advancedAnalytics'
  | 'ai' | 'aiAnalytics';

/** Map PlanFeature → PlanLimits key */
export const FEATURE_TO_LIMIT: Record<PlanFeature, keyof PlanLimits> = {
  finances: 'financesEnabled',
  gradebook: 'gradebookEnabled',
  certificates: 'certificatesEnabled',
  branches: 'branchesEnabled',
  advancedAnalytics: 'advancedAnalytics',
  ai: 'aiEnabled',
  aiAnalytics: 'aiAnalytics',
};

/** Minimum plan required per feature (for UpgradeWall display) */
export const FEATURE_MIN_PLAN: Record<PlanFeature, PlanId> = {
  finances: 'professional',
  gradebook: 'professional',
  certificates: 'professional',
  advancedAnalytics: 'professional',
  branches: 'enterprise',
  ai: 'enterprise',
  aiAnalytics: 'enterprise',
};

export const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: 1990,
    features: [
      'Up to 50 students',
      'Up to 5 teachers',
      'Up to 20 exams',
      'Lesson plan management',
      'Exam rooms with live codes',
      'Auto-grading',
      'Email support',
    ],
    limits: { maxStudents: 50, maxTeachers: 5, maxExams: 20, aiEnabled: false, aiAnalytics: false, prioritySupport: false, dedicatedSupport: false, customBranding: false, financesEnabled: false, gradebookEnabled: false, certificatesEnabled: false, branchesEnabled: false, advancedAnalytics: false },
  },
  {
    id: 'professional',
    name: 'Professional',
    price: 4990,
    features: [
      'Up to 200 students',
      'Up to 20 teachers',
      'Unlimited exams',
      'Everything in Starter',
      'AI feedback after exams',
      'Performance analytics',
      'Priority support',
    ],
    limits: { maxStudents: 200, maxTeachers: 20, maxExams: -1, aiEnabled: true, aiAnalytics: false, prioritySupport: true, dedicatedSupport: false, customBranding: false, financesEnabled: true, gradebookEnabled: true, certificatesEnabled: true, branchesEnabled: false, advancedAnalytics: true },
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 14900,
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
    limits: { maxStudents: -1, maxTeachers: -1, maxExams: -1, aiEnabled: true, aiAnalytics: true, prioritySupport: true, dedicatedSupport: true, customBranding: true, financesEnabled: true, gradebookEnabled: true, certificatesEnabled: true, branchesEnabled: true, advancedAnalytics: true },
  },
];

// ---- Organizations (Tenants) ----

export interface ContactLinks {
  telegram?: string;
  whatsapp?: string;
  instagram?: string;
  website?: string;
}

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
  publicProfileEnabled?: boolean;
  contactEmail?: string;
  contactPhone?: string;
  contactLinks?: ContactLinks;
  subjects?: string[];
  branchCities?: string[];
  branchesCount?: number;
  createdAt: string;
  updatedAt: string;
}

// ---- AI Manager Settings ----
export interface AIManagerFAQ {
  question: string;
  answer: string;
}

export interface OrgAIManagerSettings {
  organizationId: string;
  isActive: boolean;
  greetingMessage: string;
  aboutOrganization: string;
  faq: AIManagerFAQ[];
  enrollmentPolicy: string;
  customInstructions: string;
  telegramBotToken?: string;
  telegramBotUsername?: string;
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

// ---- Branches / Locations / Campuses ----

export interface Branch {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  city?: string;
  address?: string;
  phone?: string;
  whatsapp?: string;
  contactName?: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---- Users ----

export type RiskLevel = 'high' | 'medium' | 'low';

export interface StudentRiskProfile {
  studentId: string;
  studentName: string;
  avatarUrl?: string; // Optional since it maps from UserProfile
  riskLevel: RiskLevel;
  averageScore: number;
  attendanceRate: number;
  streak: number;
  daysSinceLastActive: number;
  missedAssignments: number;
  notes?: string[];
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;                  // @deprecated — use membership role
  organizationId?: string;         // @deprecated — use activeOrgId
  organizationName?: string;       // @deprecated — use membership
  // Global identity fields
  username?: string;
  activeOrgId?: string;            // currently selected org context
  avatarUrl?: string;
  parentPortalKey?: string;        // Used for generating Magic Links for parents
  pinnedBadges?: string[];         // User's top 3 pinned badges
  bio?: string;
  skills?: string[];
  experience?: string;
  city?: string;
  country?: string;
  phone?: string;
  resumeUrl?: string;              // PDF resume download URL
  resumeFileName?: string;         // PDF resume original file name
  createdAt: string;
  updatedAt: string;
}

// ---- User Posts (Portfolio) ----

export type PostMediaType = 'image' | 'video' | 'text';

export interface UserPost {
  id: string;
  authorId: string;
  authorName: string;
  type: PostMediaType;
  text: string;
  mediaUrl?: string;
  createdAt: string;
  updatedAt: string;
}

// ---- Memberships (User ↔ Organization) ----

export type MembershipRole = 'student' | 'teacher' | 'mentor' | 'manager' | 'admin' | 'owner';
export type MembershipStatus = 'pending' | 'invited' | 'active' | 'left' | 'removed';
export type JoinMethod = 'invited_by_org' | 'applied_by_user' | 'direct_added' | 'public_join';

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
  branchIds?: string[];              // assigned branch scopes (manager/teacher)
  primaryBranchId?: string;          // default branch context
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

export interface GamificationLevel {
  level: number;
  title: string;
  xp: number;
  nextLevelXp: number | null;
  nextLevelTitle?: string | null;
}

export interface GamificationData {
  xp: number;
  totalExams: number;
  passedExams: number;
  totalLessons?: number;
  totalQuizzes?: number;
  totalOrgs?: number;
  totalPosts?: number;
  streak: number;
  bestStreak: number;
  badges: string[];
  badgeDetails?: { id: string; icon: string; title: string; description: string }[];
  allBadgeDefs?: Record<string, { icon: string; title: string; description: string }>;
  orgXpBreakdown?: Record<string, number>;
  level: GamificationLevel;
  levelDefs?: { level: number; xp: number; title: string }[];
}

export interface TeacherProfile {
  uid: string;
  bio: string;
  specialization: string;
  experience: string;
  avatarUrl: string;
  socialLinks: { platform: string; url: string }[];
  education?: string;
  certificates?: string;
  subjects?: string;
  city?: string;
  resumeUrl?: string;
  resumeFileName?: string;
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

export type LessonStatus = 'draft' | 'published';

export interface LessonAttachment {
  id: string;
  name: string;
  url: string;
  storagePath: string;
  type: string; // MIME type
  size: number; // bytes
  uploadedAt: string;
}

export interface LessonHomework {
  title: string;
  description: string;
  dueDate?: string;
  points?: number;
}

export interface HomeworkSubmission {
  id: string;
  lessonId: string;
  lessonTitle: string;
  groupId?: string;
  groupName?: string;
  studentId: string;
  studentName: string;
  organizationId: string;
  content: string; // The rich text or plain text answer
  attachments?: {
    url: string;
    type: 'image' | 'video' | 'audio' | 'archive' | 'document';
    name: string;
    size: number;
  }[];
  status: 'pending' | 'reviewing' | 'graded';
  aiAnalysis?: {
    grade: number;
    suggestions: string;
    isPlagiarism: boolean;
    plagiarismProbability: number;
  };
  teacherFeedback?: string;
  finalScore?: number;
  maxPoints?: number;
  submittedAt: string;
  gradedAt?: string;
  gradedBy?: string;
}

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
  branchId?: string;
  groupIds?: string[];     // Groups this lesson belongs to
  groupNames?: string[];   // Denormalized group names
  status: LessonStatus;
  homework?: LessonHomework;
  attachments?: LessonAttachment[];
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
export type QuestionType = 'multiple_choice' | 'multi_select' | 'short_answer' | 'true_false' | 'matching' | 'media_question' | 'speaking';

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
  gradingCategories?: string[]; // Custom metrics for AI (e.g., 'Speaking', 'Coding')
  authorId: string;
  authorName: string;
  organizationId?: string;
  branchId?: string;
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
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio';
  ttsText?: string;
}

// ---- Exam Rooms ----

export type RoomStatus = 'active' | 'closed' | 'waiting';

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
  branchId?: string;
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
  branchId?: string;
  startedAt: string;
  submittedAt: string;
  timeSpentSeconds: number;
  cheatAttempts?: number;
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
  categoryScores?: Record<string, string>; // e.g. { "Speaking": "poor" }
  categoryInsights?: Record<string, string>; // e.g. { "Speaking": "Has strong accent" }
  generatedAt: string;
  modelUsed?: string;
  teacherNotes?: string;
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

// ---- Syllabuses ----

export interface SyllabusItem {
  id: string;
  title: string;
  type: 'lesson' | 'exam' | 'topic';
  lessonPlanId?: string;
  examId?: string;
  order: number;
}

export interface SyllabusModule {
  id: string;
  title: string;
  order: number;
  items: SyllabusItem[];
}

export interface Syllabus {
  id: string;
  organizationId: string;
  courseId: string;
  title: string;
  description: string;
  modules: SyllabusModule[];
  isMandatory: boolean;
  sourceFileUrl?: string; // Optional PDF reference
  createdAt: string;
  updatedAt: string;
}

// ---- Courses ----

export type CourseStatus = 'draft' | 'published' | 'archived';

export interface Course {
  id: string;
  organizationId: string;
  branchId?: string;
  title: string;
  description: string;
  subject: string;
  teacherIds: string[];
  syllabusId?: string;
  isSyllabusMandatory?: boolean;
  status: CourseStatus;
  coverImageUrl?: string;
  // Financial Settings
  price?: number; 
  paymentFormat?: 'one-time' | 'monthly'; // billing format
  durationMonths?: number;
  createdAt: string;
  updatedAt: string;
}

// ---- Groups ----

export interface Group {
  id: string;
  organizationId: string;
  branchId?: string;
  courseId: string;
  courseName?: string;
  name: string;
  studentIds: string[];
  teacherIds?: string[];
  chatLinkTitle?: string;
  chatLinkUrl?: string;
  currentSyllabusItemId?: string; // Track which syllabus lesson/topic the group is currently on
  createdAt: string;
  updatedAt: string;
}

// ---- Materials ----

export type MaterialType = 'link' | 'file' | 'video' | 'document';

export interface Material {
  id: string;
  organizationId: string;
  title: string;
  description?: string;
  type: MaterialType;
  url: string;
  sizeBytes?: number;
  mimeType?: string;
  category: string;
  tags?: string[];
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
  branchId?: string;
  type: ScheduleEventType;
  title: string;
  recurring?: boolean;           // true = weekly timetable lesson
  dayOfWeek?: number;            // 0=Mon, 1=Tue, ..., 6=Sun (for recurring)
  groupId?: string;
  groupName?: string;
  courseId?: string;
  courseName?: string;
  teacherId?: string;
  teacherName?: string;
  examId?: string;
  lessonId?: string;
  date: string;        // YYYY-MM-DD (for non-recurring events)
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
  slug?: string;
  logo?: string;
  timezone: string;
  locale: string;
  supportedLocales?: string[];
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
  isOnline?: boolean;
  // Public Profile / Visit Card
  publicProfileEnabled?: boolean;
  contactLinks?: ContactLinks;
  // Enrichment fields
  workingHours?: string;
  address?: string;
  contactEmail?: string;
  contactPhone?: string;
  photos?: string[];
  updatedAt: string;
}

// ---- Notifications ----

export type NotificationType =
  | 'invite_received'
  | 'added_to_group'
  | 'invite_accepted'
  | 'invite_declined'
  | 'exam_room_created'
  | 'exam_result_ready'
  | 'new_lesson'
  | 'new_org_registered'
  | 'new_vacancy_application'
  | 'transfer_request'
  | 'homework_submitted'
  | 'homework_graded'
  | 'trial_reminder'
  | 'trial_expired'
  | 'plan_gifted';

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
  | 'multi_select'
  | 'true_false'
  | 'matching'
  | 'short_text'
  | 'poll'
  | 'discussion'
  | 'info_slide'
  | 'media_question'
  | 'speaking';

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
  ttsText?: string;

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
  language?: string;

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
  avatarUrl?: string;
  pinnedBadges?: string[]; // display pinned badges on leaderboard

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

// ---- Gradebook / Journal / Achievements ----

export type GradingType = 'points' | 'percent' | 'letter' | 'pass_fail' | 'custom';

export interface GradeScale {
  min: number;
  max: number;
  labels?: Record<string, string>; // e.g. { 'A': '90-100', 'B': '80-89' }
}

/** Per-course grading configuration */
export interface GradeSchema {
  id: string;
  courseId: string;
  organizationId: string;
  gradingType: GradingType;
  scale: GradeScale;
  passThreshold: number;
  rules?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export type GradeStatus = 'normal' | 'absent' | 'late' | 'excused' | 'missing';

/**
 * Individual grade entry.
 * Idempotent key: (studentId + courseId + lessonId + assignmentId)
 * Uses `version` field for optimistic locking.
 */
export interface GradeEntry {
  id: string;
  studentId: string;
  courseId: string;
  lessonId?: string;
  assignmentId?: string;
  value: number | null;
  displayValue?: string; // e.g. 'A', '✔', for non-numeric display
  type: GradingType;
  maxValue: number;
  status: GradeStatus;
  comment?: string;
  createdBy: string;
  organizationId: string;
  version: number; // optimistic locking
  createdAt: string;
  updatedAt: string;
}

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';
export type ParticipationLevel = 'low' | 'medium' | 'high';

/**
 * Daily journal entry per student per course.
 * Idempotent key: (studentId + courseId + date)
 */
export interface JournalEntry {
  id: string;
  studentId: string;
  courseId: string;
  date: string; // YYYY-MM-DD
  attendance: AttendanceStatus;
  participation?: ParticipationLevel;
  lessonId?: string;
  note?: string;
  flags?: string[]; // 'late_submission', 'behavior', etc.
  createdBy: string;
  organizationId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type AchievementType = 'streak' | 'performance' | 'activity' | 'milestone';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  type: AchievementType;
  criteria: Record<string, any>; // e.g. { streakDays: 5 }
  xpReward: number;
  organizationId?: string; // null = system-wide
  createdAt: string;
}

export interface AwardedAchievement {
  id: string;
  achievementId: string;
  achievementTitle?: string;
  achievementIcon?: string;
  userId: string;
  awardedAt: string;
  source: string; // courseId or 'system'
  xpAwarded: number;
  organizationId?: string;
}

// ---- Chat System ----

export type ChatRoomType = 'group' | 'direct';
export type ChatMessageType = 'text' | 'image' | 'file' | 'system';
export type ChatParticipantRole = 'admin' | 'member';

export interface ChatParticipantDetails {
  role: ChatParticipantRole;
  joinedAt: string;
  lastReadAt: string;
  isMuted: boolean;
  isRemoved: boolean;
  displayName?: string;
  avatarUrl?: string;
}

export interface ChatRoom {
  id: string; // client-generated deterministically for DM, or random for group
  organizationId: string;
  type: ChatRoomType;
  title?: string;
  description?: string;
  imageUrl?: string;
  createdBy: string;
  participantIds: string[];
  participants: Record<string, ChatParticipantDetails>;
  lastMessageAt?: string;
  lastMessagePreview?: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MessageAttachment {
  id: string;
  type: 'image' | 'file';
  fileName: string;
  mimeType: string;
  fileSize: number;
  url: string;
}

export interface ChatMessage {
  id: string; // client-generated tempId
  roomId: string; // Parent collection link
  organizationId: string;
  senderId: string;
  senderName?: string; // display name of sender at time of sending
  messageType: ChatMessageType;
  text: string;
  attachments?: MessageAttachment[];
  replyTo?: {
    messageId: string;
    text: string;
    senderName: string;
  };
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  deletedBy?: string;
}

export interface OrganizationChatSettings {
  organizationId: string;
  canMembersDirectMessageEachOther: boolean;
  allowFileUploads: boolean;
  allowImageUploads: boolean;
  maxFileSize: number; // in bytes
}

// ============================================================
// Finance Module (SaaS Billing & Debts)
// ============================================================

export type PaymentFormat = 'one-time' | 'monthly';
export type PaymentStatus = 'paid' | 'partial' | 'overdue' | 'pending';
export type TransactionType = 'income' | 'expense';

export interface StudentPaymentPlan {
  id: string;
  organizationId: string;
  branchId?: string;
  studentId: string;
  courseId: string;
  totalAmount: number;   // Expected total payment
  paidAmount: number;    // Collected amount
  status: PaymentStatus; // Auto-calculated based on amounts & dates
  nextDueDate?: string;  // For monthly
  createdAt: string;
  updatedAt: string;
}

export interface FinancialTransaction {
  id: string;
  organizationId: string;
  branchId?: string; // Crucial for multi-branch P&L reporting
  type: TransactionType;
  amount: number;
  currency: string; // e.g. 'KZT', 'USD'
  date: string; // Payment date
  
  // Categorization
  categoryId: string; // e.g. 'course_fee', 'salary', 'rent', 'marketing'
  
  // Associated entities for analytics tracing
  paymentPlanId?: string;
  studentId?: string;
  courseId?: string;
  
  description: string;
  createdBy: string;
  createdAt: string;
}


