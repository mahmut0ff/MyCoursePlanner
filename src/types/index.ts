// ============================================================
// MyCoursePlan — TypeScript Interfaces & Types
// ============================================================

export type UserRole = 'admin' | 'teacher' | 'student';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
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
  duration: number; // minutes
  tags: string[];
  coverImageUrl: string;
  videoUrl: string;
  content: LessonContentBlock[];
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

export interface LessonContentBlock {
  id: string;
  type: 'heading' | 'paragraph' | 'bulletList' | 'image' | 'video' | 'link';
  content: string;
  level?: number; // for headings
  items?: string[]; // for bullet lists
  url?: string; // for images, videos, links
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
  passScore: number; // percentage
  randomizeQuestions: boolean;
  showResultsImmediately: boolean;
  status: ExamStatus;
  questionCount: number;
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  options: string[];
  correctAnswer: string; // for single_choice
  correctAnswers: string[]; // for multiple_choice
  keywords: string[]; // for text answers basic scoring
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

// ---- Stats ----

export interface DashboardStats {
  totalLessons: number;
  totalExams: number;
  activeRooms: number;
  totalStudents: number;
  totalAttempts: number;
}
