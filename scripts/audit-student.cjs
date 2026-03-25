const fs = require('fs');
const path = require('path');

const pages = [
  'src/pages/dashboard/DashboardPage.tsx',
  'src/pages/student/StudentCoursesPage.tsx',
  'src/pages/student/StudentGroupsPage.tsx',
  'src/pages/student/StudentTeachersPage.tsx',
  'src/pages/student/StudentDiaryPage.tsx',
  'src/pages/student/StudentProgressPage.tsx',
  'src/pages/profile/StudentProfilePage.tsx',
  'src/pages/achievements/AchievementsPage.tsx',
  'src/pages/rooms/MyResultsPage.tsx',
  'src/pages/rooms/ResultPage.tsx',
  'src/pages/certificates/CertificatePage.tsx',
  'src/pages/certificates/MyCertificatesPage.tsx',
  'src/pages/chat/ChatWorkspace.tsx',
  'src/pages/notifications/NotificationsPage.tsx',
  'src/pages/rooms/ExamTakePage.tsx',
  'src/pages/rooms/JoinRoomPage.tsx',
  'src/pages/quiz/JoinQuizPage.tsx',
  'src/pages/quiz/QuizPlayPage.tsx'
];

const results = {};

pages.forEach(p => {
  const pth = path.join(process.cwd(), p);
  if (!fs.existsSync(pth)) return;
  
  const content = fs.readFileSync(pth, 'utf8');
  
  // extract API calls
  const apiCalls = [...content.matchAll(/api[A-Z]\w+/g)].map(m => m[0]);
  
  // extract collections: collection(db, 'name') or collection('name')
  const collections = [...content.matchAll(/collection\([^'"]*['"](\w+)['"]/g)].map(m => m[1]);
  
  // extract docs: doc(db, 'name', id)
  const docs = [...content.matchAll(/doc\([^'"]*['"](\w+)['"]/g)].map(m => m[1]);
  
  // extract hooks
  const hooks = [...content.matchAll(/use[A-Z]\w+/g)].map(m => m[0]);
  
  // extract components
  const components = [...content.matchAll(/<([A-Z]\w+)/g)].map(m => m[1]);

  results[p.split('/').pop()] = {
    api: [...new Set(apiCalls)],
    collections: [...new Set(collections)],
    docs: [...new Set(docs)],
    hooks: [...new Set(hooks)],
    components: [...new Set(components)],
  };
});

fs.writeFileSync('student-surface-deps.json', JSON.stringify(results, null, 2));
console.log('Dependencies extracted to student-surface-deps.json');
