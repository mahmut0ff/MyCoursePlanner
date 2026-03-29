import { useLocation } from 'react-router-dom';
import type { PageHelpConfig } from '../data/pageHelpData';
import { PAGE_HELP_DATA } from '../data/pageHelpData';

export function usePageHelp(): PageHelpConfig | null {
  const location = useLocation();
  const path = location.pathname;

  // Exact match first
  if (PAGE_HELP_DATA[path]) {
    return PAGE_HELP_DATA[path];
  }

  // Prefix match (e.g. /lessons/new or /lessons/123 should match /lessons)
  const keys = Object.keys(PAGE_HELP_DATA).sort((a, b) => b.length - a.length); // match longest prefix first
  for (const key of keys) {
    if (path.startsWith(key)) {
      return PAGE_HELP_DATA[key];
    }
  }

  return null;
}
