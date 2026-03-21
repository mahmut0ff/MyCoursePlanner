# MyCoursePlan — Education Management Platform

A modern MVP platform for managing lesson plans and running exams in an offline educational center.

**Tech Stack**: React + Vite + Tailwind CSS + Firebase + Netlify Functions

---

## Features

- **Authentication & Roles**: Email/password auth with admin, teacher, student roles
- **Lesson Plans**: Create, edit, and view rich lesson content with TipTap editor
- **Exams**: Build exams with single/multiple choice and text questions
- **Exam Rooms**: Start rooms with codes, students join and take exams with timer
- **Auto-Grading**: Automatic scoring for choice questions, keyword matching for text
- **AI Feedback**: Post-exam diagnostic using Gemini (swappable provider)
- **Dashboards**: Role-based views for staff and students

---

## Prerequisites

- Node.js 18+
- Firebase project with Auth, Firestore, and Storage enabled
- Netlify account (for deployment)
- Gemini API key (for AI feedback)

---

## Firebase Setup

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Authentication** → Email/Password provider
3. Enable **Cloud Firestore** (start in test mode for development)
4. Enable **Firebase Storage**
5. Go to **Project Settings → Service Accounts** → Generate a new private key (for Netlify Functions)
6. Go to **Project Settings → General** → copy the web app config values

---

## Environment Variables

Create a `.env` file (see `.env.example`):

### Frontend (Vite)
```
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### Netlify Functions (server-side)
```
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_CLIENT_EMAIL=your_service_account_email
FIREBASE_PRIVATE_KEY=your_private_key
GEMINI_API_KEY=your_gemini_api_key
```

---

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## Deployment (Netlify)

1. Push your code to a Git repository (GitHub, GitLab, etc.)
2. Connect the repo to Netlify
3. Netlify will auto-detect the build settings from `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions: `netlify/functions`
4. Add all environment variables in Netlify → Site settings → Environment variables
5. Deploy!

---

## Firestore Collections

| Collection | Description |
|---|---|
| `users` | User profiles with role |
| `lessonPlans` | Lesson plan documents |
| `exams` | Exam metadata |
| `exams/{id}/questions` | Questions subcollection |
| `examRooms` | Active and closed exam rooms |
| `examAttempts` | Student exam submissions and results |

---

## Project Structure

```
src/
├── components/      # Reusable components
│   ├── auth/        # ProtectedRoute
│   └── layout/      # AppLayout, Sidebar, Topbar
├── contexts/        # AuthContext
├── lib/             # Firebase initialization
├── pages/           # Route-level pages
│   ├── auth/        # Login, Register
│   ├── dashboard/   # Admin/Student dashboards
│   ├── exams/       # Exam CRUD
│   ├── lessons/     # Lesson plan CRUD
│   └── rooms/       # Exam rooms, taking, results
├── services/        # Firestore CRUD services
├── types/           # TypeScript interfaces
└── utils/           # Grading, formatting helpers

netlify/functions/   # Serverless functions (AI feedback)
```

---

## License

MIT
