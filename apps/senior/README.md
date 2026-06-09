# Planula Senior (React Native)

Mobile app for teachers. Replaces the old Flutter `teacher/` project.

## Stack

- Expo SDK 51 + expo-router (file-based routing, typed routes)
- TypeScript strict mode
- NativeWind v4 (Tailwind for React Native)
- @react-native-firebase/{app,auth,firestore,messaging,storage}
- @tanstack/react-query (server cache) + zustand (UI state)
- lucide-react-native (icons)
- @planula/api + @planula/types (shared with web and Junior)

## First run

```bash
# From the repo root
pnpm install

# Drop the Firebase native config files into apps/senior/:
#   google-services.json (Android)
#   GoogleService-Info.plist (iOS)
# Both are gitignored.

cd apps/senior
pnpm expo start
```

Open the dev menu, scan the QR with Expo Go (Android) or run a dev client.

## Layout

```
app/
├── _layout.tsx          Root providers + auth gate
├── (auth)/
│   ├── _layout.tsx      Stack
│   ├── login.tsx
│   └── register.tsx
└── (tabs)/
    ├── _layout.tsx      Bottom tabs (5)
    ├── index.tsx        Главная (KPI dashboard)
    ├── journal.tsx      Журнал
    ├── courses.tsx      Курсы
    ├── schedule.tsx     Расписание
    └── profile.tsx      Профиль
src/
├── lib/
│   ├── api.ts           Pre-bound shared API client
│   └── auth.ts          Firebase auth helpers + useAuthState
└── components/
    └── ScreenPlaceholder.tsx
```

## Brand

- Primary: `#7C3AED` (purple) — `bg-brand-600`
- Secondary: `#10B981` (emerald)
- Tertiary: `#F59E0B` (amber)

Matches the old Flutter Material 3 theme so users won't feel the swap.
