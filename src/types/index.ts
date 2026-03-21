// ============================================================
// MyCoursePlan — TypeScript Interfaces & Types
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
  role: UserRole;
  organizationId?: string; // null for super_admin
  organizationName?: string;
  createdAt: string;
  updatedAt: string;
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
}
