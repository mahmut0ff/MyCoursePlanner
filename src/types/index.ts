// ============================================================
// SabakHub — TypeScript Interfaces & Types
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
  payrollEnabled: boolean; // зарплатный модуль учителей — professional+ (чувствительнее финансов)
  gradebookEnabled: boolean;
  certificatesEnabled: boolean;
  branchesEnabled: boolean;
  advancedAnalytics: boolean;
  rbacEnabled: boolean;

}

/** Canonical feature keys for plan gating */
export type PlanFeature =
  | 'finances' | 'payroll' | 'gradebook' | 'certificates'
  | 'branches' | 'advancedAnalytics' | 'rbac'
  | 'ai' | 'aiAnalytics';

/** Map PlanFeature → PlanLimits key */
export const FEATURE_TO_LIMIT: Record<PlanFeature, keyof PlanLimits> = {
  finances: 'financesEnabled',
  payroll: 'payrollEnabled',
  gradebook: 'gradebookEnabled',
  certificates: 'certificatesEnabled',
  branches: 'branchesEnabled',
  advancedAnalytics: 'advancedAnalytics',
  rbac: 'rbacEnabled',
  ai: 'aiEnabled',
  aiAnalytics: 'aiAnalytics',
};

/** Minimum plan required per feature (for UpgradeWall display) */
export const FEATURE_MIN_PLAN: Record<PlanFeature, PlanId> = {
  finances: 'professional',
  payroll: 'professional',
  gradebook: 'professional',
  certificates: 'professional',
  advancedAnalytics: 'professional',
  rbac: 'professional',
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
    limits: { maxStudents: 50, maxTeachers: 5, maxExams: 20, aiEnabled: false, aiAnalytics: false, prioritySupport: false, dedicatedSupport: false, customBranding: false, financesEnabled: false, payrollEnabled: false, gradebookEnabled: false, certificatesEnabled: false, branchesEnabled: false, advancedAnalytics: false, rbacEnabled: false },
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
    limits: { maxStudents: 200, maxTeachers: 20, maxExams: -1, aiEnabled: true, aiAnalytics: false, prioritySupport: true, dedicatedSupport: false, customBranding: false, financesEnabled: true, payrollEnabled: true, gradebookEnabled: true, certificatesEnabled: true, branchesEnabled: false, advancedAnalytics: true, rbacEnabled: true },
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
    limits: { maxStudents: -1, maxTeachers: -1, maxExams: -1, aiEnabled: true, aiAnalytics: true, prioritySupport: true, dedicatedSupport: true, customBranding: true, financesEnabled: true, payrollEnabled: true, gradebookEnabled: true, certificatesEnabled: true, branchesEnabled: true, advancedAnalytics: true, rbacEnabled: true },
  },
];

// ---- Organizations (Tenants) ----

export interface ContactLinks {
  telegram?: string;
  whatsapp?: string;
  instagram?: string;
  website?: string;
}

/** Institution profile — adapts terminology and default grading scale per segment. */
export type InstitutionType = 'center' | 'school' | 'language' | 'academy';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  ownerEmail: string;
  planId: PlanId;
  status: OrgStatus;
  institutionType?: InstitutionType;
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
  /** Manual billing: the date the org is paid through (ISO). Super-admin sets it. */
  paidUntil?: string;
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
  examsTaken?: number;
  attendanceRate: number;
  streak: number;
  daysSinceLastActive: number;
  daysSinceEnrolled?: number;
  hasActivity?: boolean; // false = newly added, no engagement yet (not a churn risk)
  missedAssignments: number;
  missedLessons?: number;
  /** Plain-language engagement reasons ("не был(а) 12 дн."). Never includes debt. */
  reasons?: string[];
  scoreTrend?: 'up' | 'down' | 'flat';
  /** Finance signal, deliberately kept out of `riskLevel` — it gets its own badge. */
  hasOverduePayment?: boolean;
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
  activeRole?: UserRole;          // active role within the active org (multi-role members)
  avatarUrl?: string;
  parentPortalKey?: string;        // Used for generating Magic Links for parents
  parentTelegramChatIds?: string[]; // Parent Telegram chats linked to this student (push channel)
  pinnedBadges?: string[];         // User's top 3 pinned badges
  bio?: string;
  skills?: string[];
  experience?: string;
  city?: string;
  country?: string;
  phone?: string;
  resumeUrl?: string;              // PDF resume download URL
  resumeFileName?: string;         // PDF resume original file name
  enrollmentDate?: string;         // Дата поступления (YYYY-MM-DD) — optional, manager-set
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
  role: MembershipRole;              // primary/default role (roles[0])
  roles?: MembershipRole[];          // all roles this member holds in the org (multi-role)
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
    summary?: string;
    strengths?: string[];
    weaknesses?: string[];
    grammarIssues?: {
      fragment: string;
      correction: string;
      explanation?: string;
    }[];
    checkedAt?: string;
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
  placementLevels?: string[]; // Level scale for placement tests (e.g. CEFR: A1, A2, B1...). When set, AI classifies the student into one of these.
  acceptingResponses?: boolean; // Public QR/link access. When false, the public test link is closed. Undefined = open (default).
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
  status: 'correct' | 'incorrect' | 'pending_review' | 'partial';
  aiGraded?: boolean;      // points were assigned by the AI grader
  aiComment?: string;      // AI's per-answer rationale (for open/text answers)
  manuallyGraded?: boolean; // a teacher overrode the points
}

// ---- AI Feedback ----

export interface AIFeedback {
  strengths: string[];
  weakTopics: string[];
  reviewSuggestions: string[];
  summary: string;
  level?: string; // Determined level/verdict (e.g. CEFR "B1" for language placement, or "Intermediate")
  levelDescription?: string; // Short human explanation of why this level was assigned
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

// Курс НЕ имеет branchId: это общеорганизационный каталог. К филиалу привязывается
// Group (ниже) — она и есть «этот курс, в этом филиале, для этих студентов».
export interface Course {
  id: string;
  organizationId: string;
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

// Lifecycle status. Undefined is treated as 'active' for groups created before
// the field existed.
export type GroupStatus = 'active' | 'completed' | 'archived';

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
  status?: GroupStatus;
  createdBy?: string; // uid of the staff member who created the group (own-groups scope for teachers)
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
  institutionType?: InstitutionType;
  gradingScale?: 'percentage' | 'letter' | 'points';
  passingScore: number;
  // Teacher self-service: allow teachers to create/edit/delete their own groups (admin-controlled)
  teacherGroupManagement?: boolean;
  // Allow teachers to archive / change the status of groups they teach (admin-controlled)
  teacherGroupStatus?: boolean;
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
  // 'video' is only ever produced by the support desk, which renders it as an
  // inline player; chat classifies the same upload as 'file'. Widening the union
  // is safe — every consumer already has a fallback branch for 'file'.
  type: 'image' | 'video' | 'file';
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

// ---- Support (platform helpdesk) ----
//
// Deliberately NOT modelled on ChatRoom. A support conversation crosses the org
// boundary — one side is a member of some org, the other is the platform super
// admin who belongs to none — so participant-scoped rules and the mandatory
// `organizationId` that `chatRooms` is built on do not apply here.
//
// One thread per user, keyed by uid: the user opens «Поддержка» and is already
// in their conversation, with no «create a ticket» step. `status` gives the
// super admin triage without fragmenting the history.

export type SupportThreadStatus = 'new' | 'open' | 'closed';
/** Which side of the desk a message came from. Never trust the client for this. */
export type SupportSide = 'user' | 'support';

export interface SupportThread {
  id: string;              // === userId
  userId: string;
  userName: string;
  userEmail: string;
  userAvatarUrl?: string;
  /** Denormalised so the admin inbox lists threads without N cross-org reads. */
  userRole: string;
  organizationId: string | null;
  organizationName: string | null;
  status: SupportThreadStatus;
  lastMessageAt: string;
  lastMessagePreview: string;
  lastMessageFrom: SupportSide;
  /** Per-side counters — a single `unread` flag can't serve both inboxes. */
  unreadForSupport: number;
  unreadForUser: number;
  createdAt: string;
  updatedAt: string;
}

export interface SupportMessage {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  senderSide: SupportSide;
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

/** Right-hand panel payload — assembled server-side, crosses org boundaries. */
export interface SupportUserInfo {
  uid: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  role: string;
  phone?: string;
  city?: string;
  createdAt?: string;
  lastSignInAt?: string;
  disabled?: boolean;
  organizationId: string | null;
  organizationName: string | null;
  organizationSlug?: string | null;
  planId?: string | null;
  institutionType?: string | null;
  branchNames: string[];
  membershipRole?: string | null;
  customRoleName?: string | null;
  memberships: { organizationId: string; organizationName: string; role: string; status: string }[];
}

// ============================================================
// Finance Module (SaaS Billing & Debts)
// ============================================================

export type PaymentFormat = 'one-time' | 'monthly';
/** `cancelled` пишет api-org при выходе студента из группы по нетронутому счёту. */
export type PaymentStatus = 'paid' | 'partial' | 'overdue' | 'pending' | 'cancelled';
export type TransactionType = 'income' | 'expense';

export interface StudentPaymentPlan {
  id: string;
  organizationId: string;
  branchId?: string | null; // null = счёт вне филиала
  studentId: string;
  studentName?: string; // денормализация на запись, для списков без join
  courseId: string; // литерал 'general' у счетов, созданных вручную
  courseName?: string;
  totalAmount: number; // сколько должны заплатить
  paidAmount: number;  // сколько уже пришло
  status: PaymentStatus;
  deadline?: string; // настоящий срок оплаты, по нему считается просрочка
  /** @deprecated Пишется api-org.ts, но не читается ни одним потребителем — ориентируйтесь на `deadline`. */
  nextDueDate?: string;
  billingType?: 'monthly'; // счёт создан ежемесячным биллингом
  period?: string;         // 'YYYY-MM', период ежемесячного счёта
  autoBilled?: boolean;    // выставлен monthly-billing, а не человеком
  lastDebtReminderDate?: string; // защита от повторной рассылки о долге
  createdAt: string;
  updatedAt: string;
}

export interface FinancialTransaction {
  id: string;
  organizationId: string;
  branchId?: string | null; // разделение P&L по филиалам
  type: TransactionType;
  amount: number;
  /** @deprecated Объявлено, но не пишется ни одним путём кода — сумма всегда в сомах. */
  currency?: string;
  date: string;

  categoryId: string; // 'course_fee', 'salary', 'rent', 'marketing'...
  description?: string;
  paymentMethod?: 'cash' | 'card' | 'transfer'; // выбирается в форме приёма оплаты

  // Привязки для аналитики
  paymentPlanId?: string;
  studentId?: string;
  courseId?: string;
  groupId?: string;
  teacherId?: string;

  /**
   * Проставляются только на транзакциях-выплатах зарплаты (шаг «оплатить» периода).
   * Идемпотентность выплаты держится на запросе financeTransactions по РАВЕНСТВУ
   * payrollPeriodId: уже выплаченные строки узнаются по payrollLineId и
   * пропускаются при повторном вызове. Не переименовывать и не делать составными —
   * составные индексы не задеплоены, запрос обязан оставаться equality-only.
   */
  payrollPeriodId?: string;
  payrollLineId?: string;

  createdBy: string;
  createdAt: string;
  updatedAt?: string;

  // Обогащение на чтении: подставляет GET api-finance-transactions, в Firestore не хранится.
  studentName?: string;
  courseName?: string;
  createdByName?: string;
}

/** Точка графика доход/расход. Дата строго 'YYYY-MM-DD' — AdminDashboard режет её посимвольно. */
export interface FinanceChartPoint {
  date: string;
  income: number;
  expense: number;
}

export interface FinanceCategoryBucket {
  categoryId: string;
  amount: number;
  count: number;
}

export interface FinanceMethodBucket {
  paymentMethod: string;
  amount: number;
  count: number;
}

export interface CourseProfitability {
  courseId: string; // 'general' — корзина «Без курса», всегда сортируется последней
  courseName: string;
  income: number;
  expense: number;
  net: number;
  studentCount: number;
}

/**
 * Ответ GET api-finance-metrics.
 *
 * unassignedBranch* — СПРАВКА, а не отдельное слагаемое: это записи без branchId.
 * Без фильтра филиала они уже входят в соответствующий итог, с фильтром — не
 * входят и объясняют разрыв между суммой филиалов и итогом по организации.
 * Никогда не складывайте их с итогом и не вычитайте из него.
 */
export interface FinanceMetrics {
  period: string;
  startDate: string; // ISO, граница окна (не 'YYYY-MM-DD')
  endDate: string;
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
  totalActiveDebt: number;
  /** Алиас totalActiveDebt. Оставлен ради существующих потребителей. */
  outstandingDebt: number;
  overdueCount: number;
  debtorCount: number;
  chartData: FinanceChartPoint[];
  expenseByCategory: FinanceCategoryBucket[];
  incomeByMethod: FinanceMethodBucket[];
  courseProfitability: CourseProfitability[];
  unattributedExpense: number;
  unassignedBranchIncome: number;
  unassignedBranchExpense: number;
  unassignedBranchDebt: number;
  previous: { totalIncome: number; totalExpense: number; netProfit: number };
  /**
   * false, когда `previous` — нулевая база, а не настоящее окно сравнения:
   * period='all' (предыдущего окна нет) либо предыдущее окно целиком раньше первой
   * записи. UI обязан показать «—» вместо роста в %, иначе деление на 0 даёт
   * Infinity%/NaN%.
   */
  previousComparable: boolean;
}

// ============================================================
// Payroll Module (Teacher Compensation)
// Деньги на сервере — целые минорные единицы; финансовая транзакция при выплате
// конвертирует в сомы на границе. Все коллекции server-mediated (Admin SDK).
// ============================================================

/**
 * Неизменяемая запись «урок состоялся» (коллекция `lessonSessions`). Пишется в
 * том же batch, что и журнал, при отметке посещаемости. Единственный источник
 * для per_lesson/per_hour/per_student — никогда scheduleEvents.
 */
export interface LessonSession {
  id: string;
  organizationId: string;
  branchId: string | null;      // из группы/курса, как штампуется филиал в финансах
  groupId: string;
  courseId: string;
  /**
   * null = вели несколько учителей и никто не выбран. Такая сессия не принадлежит
   * никому: per_lesson/per_hour/per_student её ПРОПУСКАЮТ. Никогда не выводится из
   * того, кто отметил журнал (createdBy/confirmedBy) — это приписало бы чужую оплату.
   */
  teacherId: string | null;
  date: string;                 // 'YYYY-MM-DD'
  /** null = длительность неизвестна → per_hour эту сессию пропускает: видимый ноль лучше догадки. */
  durationMinutes: number | null;
  status: 'held' | 'cancelled';
  headcount: number;            // сколько присутствовало → база для per_student
  sourceEventId: string | null; // из какого шаблона scheduleEvent материализована, если был
  confirmedBy: string;
  confirmedAt: string;
  createdAt: string;
}

/** Область действия компонента: пусто/отсутствует = все курсы и группы учителя. */
export interface RuleScope {
  courseIds?: string[];
  groupIds?: string[];
}

/**
 * Компонент ставки. Сумма компонентов = заработок правила.
 * amountMinor — целые минорные единицы; percentBp — базисные пункты (2000 = 20%).
 */
export type PayComponent =
  | { kind: 'salary'; amountMinor: number } // фиксированный оклад; даёт строку даже при нулевой активности
  | { kind: 'percent_revenue'; percentBp: number; base: 'collected'; scope: RuleScope } // % от СОБРАННОЙ наличности в окне
  | { kind: 'per_lesson'; amountMinor: number; scope: RuleScope }  // × число held-сессий в scope
  | { kind: 'per_hour'; amountMinor: number; scope: RuleScope }    // amountMinor за 60 мин; пропорция по durationMinutes
  | { kind: 'per_student'; amountMinor: number; scope: RuleScope }; // × Σ headcount по held-сессиям в scope

/**
 * Карточка ставки (коллекция `compensationRules`) — append-only, датируется
 * периодом действия. Инвариант: одно активное правило на учителя на период.
 * Изменение ставки закрывает effectiveTo старого правила и вставляет новую
 * версию с supersedesId.
 */
export interface CompensationRule {
  id: string;
  organizationId: string;
  teacherId: string;            // может быть синтетический id offline-учителя — не полагаться на Auth-аккаунт
  branchId: string | null;
  label: string;                // «Оклад + 20% с группы А» — показывается на расчётном листе дословно
  status: 'active' | 'archived';
  components: PayComponent[];
  effectiveFrom: string;        // 'YYYY-MM' включительно
  effectiveTo: string | null;   // 'YYYY-MM' включительно; null = бессрочно
  supersedesId: string | null;  // цепочка аудита «почему изменилась оплата»
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Состояние периода. approve замораживает; approved/paid НИКОГДА не пересчитывается. */
export type PayrollPeriodState = 'draft' | 'calculated' | 'approved' | 'paid';

/**
 * Период начисления зарплаты — жизненный цикл draft→calculated→approved→paid.
 * windowStart/windowEnd замораживаются при первом calculate.
 */
export interface PayrollPeriod {
  id: string;
  organizationId: string;
  period: string;               // 'YYYY-MM'
  branchId: string | null;
  state: PayrollPeriodState;
  windowStart: string;          // окно собранной выручки и сессий; ЗАМОРОЖЕНО при первом calculate
  windowEnd: string;
  calculatedAt?: string;
  calculatedBy?: string;
  approvedAt?: string;
  approvedBy?: string;
  paidAt?: string;
  paidBy?: string;
  totalMinor: number;           // заморожен при approve
  createdAt: string;
  updatedAt: string;
}

/** Откуда взялась строка ведомости. */
export type PayrollLineSource = 'rule' | 'manual_bonus' | 'manual_penalty' | 'refund_adjustment';

/**
 * Строка расчётной ведомости. source:'rule' пересобирается при каждом calculate;
 * isManual (премия/штраф) переживает пересчёт. finalMinor = COALESCE(override, computed).
 */
export interface PayrollLine {
  id: string;
  organizationId: string;
  periodId: string;
  period: string;               // 'YYYY-MM'
  teacherId: string;
  teacherName: string;          // денормализовано для расчётного листа
  ruleId: string | null;        // null у ручных строк
  /**
   * ЗАМОРОЖЕННОЕ разрешённое правило плюс пофакторные литеральные входы
   * (revenueBaseMinor, sourceTxnIds, sessionCount, sourceSessionIds…), чтобы
   * число можно было восстановить, не пересчитывая. У ручных строк — {}.
   */
  ruleSnapshot: Record<string, unknown>;
  source: PayrollLineSource;
  isManual: boolean;            // премия/штраф; ПЕРЕЖИВАЕТ пересчёт
  originPeriodId: string | null; // для корректировок закрытого периода, перенесённых вперёд
  computedMinor: number;
  overrideMinor: number | null; // сумма, переопределённая директором
  overrideReason: string | null;
  finalMinor: number;           // COALESCE(override, computed)
  note?: string;
  branchId?: string | null;
  createdBy?: string;           // пишется только на ручных строках
  createdAt: string;
}


