import { BookOpen, Users, ClipboardList, Monitor, Library, History, Calendar, BarChart3, TrendingDown, FileText, LayoutDashboard, CreditCard, FolderOpen, Building2 } from 'lucide-react';
import React from 'react';

export interface PageHelpConfig {
  id: string; // Refers to pageHelp.[id] in translations
  featuresIcons: React.ElementType[];
  tipsCount: number;
}

// Maps pathnames to help config id and icons
export const PAGE_HELP_DATA: Record<string, PageHelpConfig> = {
  '/dashboard': {
    id: 'dashboard',
    featuresIcons: [LayoutDashboard, BarChart3, Calendar],
    tipsCount: 2
  },
  '/lessons': {
    id: 'lessons',
    featuresIcons: [BookOpen, FileText, Users],
    tipsCount: 2
  },
  '/materials': {
    id: 'materials',
    featuresIcons: [FolderOpen, FileText],
    tipsCount: 1
  },
  '/exams': {
    id: 'exams',
    featuresIcons: [ClipboardList, FileText, BarChart3],
    tipsCount: 1
  },
  '/rooms': {
    id: 'rooms',
    featuresIcons: [Monitor, History, Users],
    tipsCount: 2
  },
  '/quiz/library': {
    id: 'quiz_library',
    featuresIcons: [Library, FolderOpen],
    tipsCount: 1
  },
  '/quiz/sessions': {
    id: 'quiz_sessions',
    featuresIcons: [History, BarChart3],
    tipsCount: 0
  },
  '/journal': {
    id: 'journal',
    featuresIcons: [ClipboardList, BarChart3],
    tipsCount: 1
  },
  '/gradebook': {
    id: 'gradebook',
    featuresIcons: [LayoutDashboard, Users],
    tipsCount: 0
  },
  '/groups': {
    id: 'groups',
    featuresIcons: [Users, LayoutDashboard],
    tipsCount: 0
  },
  '/courses': {
    id: 'courses',
    featuresIcons: [BookOpen, FolderOpen],
    tipsCount: 1
  },
  '/finances': {
    id: 'finances',
    featuresIcons: [CreditCard, History],
    tipsCount: 1
  },
  '/schedule': {
    id: 'schedule',
    featuresIcons: [Calendar, Users],
    tipsCount: 1
  },
  '/teacher-analytics': {
    id: 'teacher_analytics',
    featuresIcons: [BarChart3, TrendingDown],
    tipsCount: 0
  },
  '/risk-dashboard': {
    id: 'risk_dashboard',
    featuresIcons: [TrendingDown, Users],
    tipsCount: 1
  },
  '/org-settings': {
    id: 'org_settings',
    featuresIcons: [Building2, FolderOpen],
    tipsCount: 1
  }
};
