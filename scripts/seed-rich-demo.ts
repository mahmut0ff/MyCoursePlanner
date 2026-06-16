import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
});

const db = getFirestore(app);
const auth = getAuth(app);
const now = () => new Date().toISOString();

function daysFromNow(d: number) {
  const dt = new Date();
  dt.setDate(dt.getDate() + d);
  return dt.toISOString();
}

function hoursFromNow(h: number) {
  const dt = new Date();
  dt.setHours(dt.getHours() + h);
  return dt.toISOString();
}

async function main() {
  console.log('🚀 Seeding rich demo data...');

  // --- Get org ---
  const orgSnap = await db.collection('organizations').where('name', '==', 'SabakHub').limit(1).get();
  if (orgSnap.empty) { console.error('❌ SabakHub org not found. Run seed-planula.ts first.'); process.exit(1); }
  const orgId = orgSnap.docs[0].id;
  console.log('📌 Org:', orgId);

  // --- Get teacher uid ---
  let teacherUid: string;
  try {
    const u = await auth.getUserByEmail('e.smirnova@planula.demo');
    teacherUid = u.uid;
  } catch {
    console.error('❌ Teacher user not found. Run seed-demo-planula.ts first.');
    process.exit(1);
  }

  // --- Make teacher an owner ---
  await db.collection('users').doc(teacherUid).collection('memberships').doc(orgId).set({
    organizationId: orgId,
    organizationName: 'SabakHub',
    role: 'owner',
    status: 'active',
    joinedAt: now(),
  }, { merge: true });
  await db.collection('orgMembers').doc(orgId).collection('members').doc(teacherUid).set({
    userId: teacherUid,
    userEmail: 'e.smirnova@planula.demo',
    userName: 'Елена Смирнова',
    role: 'owner',
    status: 'active',
    joinedAt: now()
  }, { merge: true });
  await db.collection('users').doc(teacherUid).set({ role: 'admin' }, { merge: true });
  console.log('✅ Teacher promoted to owner');

  // --- Get student uids ---
  const studentEmails = [
    'd.kamilova@planula.demo',
    't.rahmanov@planula.demo',
    'a.murat@planula.demo',
    's.bekov@planula.demo',
    'm.kalykov@planula.demo'
  ];
  const students: { uid: string; name: string; email: string }[] = [];
  for (const email of studentEmails) {
    try {
      const u = await auth.getUserByEmail(email);
      const name = u.displayName || email.split('@')[0];
      students.push({ uid: u.uid, name, email });
    } catch { /* skip */ }
  }
  console.log(`👥 Found ${students.length} students`);

  // --- Get or create second teacher ---
  let teacher2Uid: string;
  try {
    const u = await auth.getUserByEmail('a.ivanov@planula.demo');
    teacher2Uid = u.uid;
  } catch {
    const u = await auth.createUser({ email: 'a.ivanov@planula.demo', password: 'DemoPassword123!', displayName: 'Алексей Иванов' });
    teacher2Uid = u.uid;
  }

  // --- Get course IDs ---
  const coursesSnap = await db.collection('courses').where('organizationId', '==', orgId).get();
  const courseIds = coursesSnap.docs.map(d => d.id);
  const courseId = courseIds[0];
  console.log(`📚 Courses: ${courseIds.length}`);

  // --- Delete old schedule events ---
  const oldEvents = await db.collection('scheduleEvents').where('organizationId', '==', orgId).get();
  for (const d of oldEvents.docs) await d.ref.delete();

  // --- Create schedule for the current week ---
  console.log('📅 Creating schedule...');
  const scheduleEvents = [
    { title: 'Frontend: React Hooks', teacherName: 'Елена Смирнова', day: 0, startH: 10, endH: 12, room: 'Аудитория 3', studentCount: 5 },
    { title: 'UX/UI: Wireframes в Figma', teacherName: 'Алексей Иванов', day: 0, startH: 14, endH: 16, room: 'Аудитория 1', studentCount: 4 },
    { title: 'English: Speaking Club', teacherName: 'Елена Смирнова', day: 1, startH: 9, endH: 10, room: 'Онлайн', studentCount: 8 },
    { title: 'Frontend: TypeScript Advanced', teacherName: 'Елена Смирнова', day: 1, startH: 11, endH: 13, room: 'Аудитория 3', studentCount: 5 },
    { title: 'UX/UI: Прототипирование', teacherName: 'Алексей Иванов', day: 2, startH: 10, endH: 12, room: 'Аудитория 1', studentCount: 4 },
    { title: 'Frontend: REST API & Fetch', teacherName: 'Елена Смирнова', day: 2, startH: 14, endH: 16, room: 'Аудитория 3', studentCount: 5 },
    { title: 'English: Grammar C1', teacherName: 'Елена Смирнова', day: 3, startH: 9, endH: 10, room: 'Онлайн', studentCount: 8 },
    { title: 'Контрольный Quiz: JS', teacherName: 'Елена Смирнова', day: 3, startH: 11, endH: 12, room: 'Аудитория 3', studentCount: 5 },
    { title: 'UX/UI: Итоговый проект', teacherName: 'Алексей Иванов', day: 4, startH: 10, endH: 13, room: 'Аудитория 1', studentCount: 4 },
    { title: 'Frontend: Защита проектов', teacherName: 'Елена Смирнова', day: 4, startH: 14, endH: 17, room: 'Аудитория 3', studentCount: 5 },
  ];

  for (const ev of scheduleEvents) {
    const start = new Date();
    start.setDate(start.getDate() + ev.day);
    start.setHours(ev.startH, 0, 0, 0);
    const end = new Date();
    end.setDate(end.getDate() + ev.day);
    end.setHours(ev.endH, 0, 0, 0);
    await db.collection('scheduleEvents').add({
      title: ev.title,
      teacherName: ev.teacherName,
      teacherId: teacherUid,
      organizationId: orgId,
      courseId: courseId,
      room: ev.room,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      studentCount: ev.studentCount,
      status: ev.day < 2 ? 'completed' : 'scheduled',
      type: 'lesson',
      createdAt: now(),
    });
  }

  // --- Create more lessons ---
  console.log('📖 Creating lessons...');
  const oldLessons = await db.collection('lessonPlans').where('organizationId', '==', orgId).get();
  for (const d of oldLessons.docs) await d.ref.delete();

  const lessons = [
    {
      title: 'Введение в React: компоненты и JSX',
      status: 'published',
      topic: 'React Basics',
      homework: { title: 'Создать первый компонент', description: 'Создайте компонент Card с пропсами title, text, imageUrl', dueDate: daysFromNow(-5), points: 10 }
    },
    {
      title: 'useState и управление состоянием',
      status: 'published',
      topic: 'React State',
      homework: { title: 'Счётчик с историей', description: 'Реализуйте счётчик, сохраняющий историю изменений', dueDate: daysFromNow(-3), points: 15 }
    },
    {
      title: 'Основы React Hooks: useEffect, useContext',
      status: 'published',
      topic: 'React Hooks',
      homework: { title: 'ToDo с LocalStorage', description: 'Реализуйте useReducer для стейта задач', dueDate: daysFromNow(2), points: 20 }
    },
    {
      title: 'TypeScript в React: типизация пропсов и стейта',
      status: 'published',
      topic: 'TypeScript',
      homework: { title: 'Типизировать компоненты', description: 'Добавьте строгую типизацию к предыдущим компонентам', dueDate: daysFromNow(5), points: 20 }
    },
    {
      title: 'REST API: fetch, axios, React Query',
      status: 'draft',
      topic: 'API Integration',
      homework: null
    },
    {
      title: 'Маршрутизация с React Router v6',
      status: 'draft',
      topic: 'Routing',
      homework: null
    },
  ];

  const lessonIds: string[] = [];
  for (const l of lessons) {
    const ref = db.collection('lessonPlans').doc();
    lessonIds.push(ref.id);
    await ref.set({
      ...l,
      organizationId: orgId,
      courseId: courseId,
      authorId: teacherUid,
      authorName: 'Елена Смирнова',
      groupIds: [],
      attachments: [],
      createdAt: daysFromNow(-7),
      updatedAt: now(),
    });
  }
  console.log(`✅ ${lessons.length} lessons created`);

  // --- Create gradebook entries ---
  console.log('📊 Creating gradebook...');
  const oldGrades = await db.collection('grades').where('organizationId', '==', orgId).get();
  for (const d of oldGrades.docs) await d.ref.delete();

  const gradeData = [
    { studentIdx: 0, scores: [10, 14, 18, null] },
    { studentIdx: 1, scores: [8, 12, 16, 19] },
    { studentIdx: 2, scores: [10, 15, null, null] },
    { studentIdx: 3, scores: [9, 13, 17, 18] },
    { studentIdx: 4, scores: [7, 11, 15, null] },
  ];

  for (const g of gradeData) {
    const student = students[g.studentIdx];
    if (!student) continue;
    for (let i = 0; i < g.scores.length; i++) {
      if (g.scores[i] === null) continue;
      await db.collection('grades').add({
        organizationId: orgId,
        courseId: courseId,
        lessonId: lessonIds[i],
        lessonTitle: lessons[i].title,
        studentId: student.uid,
        studentName: student.name,
        teacherId: teacherUid,
        score: g.scores[i],
        maxScore: lessons[i].homework?.points ?? 20,
        type: 'homework',
        gradedAt: daysFromNow(i - 6),
        createdAt: now(),
      });
    }
  }
  console.log('✅ Gradebook populated');

  // --- Create Exams with results ---
  console.log('📝 Creating exams...');
  const oldExams = await db.collection('exams').where('organizationId', '==', orgId).get();
  for (const d of oldExams.docs) await d.ref.delete();

  const exam1Ref = db.collection('exams').doc();
  await exam1Ref.set({
    title: 'Контрольный тест: React & Hooks',
    organizationId: orgId,
    courseId: courseId,
    teacherId: teacherUid,
    status: 'completed',
    duration: 30,
    passingScore: 60,
    questions: [
      { id: 'q1', type: 'multiple_choice', text: 'Какой хук используется для side-эффектов?', options: ['useState', 'useEffect', 'useRef', 'useMemo'], correctAnswer: 1, points: 10 },
      { id: 'q2', type: 'multiple_choice', text: 'Что возвращает useState?', options: ['Значение', 'Функцию', 'Массив [значение, сеттер]', 'Объект'], correctAnswer: 2, points: 10 },
      { id: 'q3', type: 'multiple_choice', text: 'Как передать данные вниз по дереву без prop drilling?', options: ['Redux', 'Context API', 'localStorage', 'URL params'], correctAnswer: 1, points: 10 },
      { id: 'q4', type: 'multiple_choice', text: 'Что такое Virtual DOM?', options: ['Реальный DOM браузера', 'Копия DOM в памяти JS', 'CSS переменные', 'Node.js модуль'], correctAnswer: 1, points: 10 },
    ],
    createdAt: daysFromNow(-4),
    completedAt: daysFromNow(-3),
  });

  // Exam attempts with AI feedback
  const examResults = [
    { studentIdx: 0, score: 38, answers: [1, 2, 1, 1], feedback: 'Отличный результат! Все ключевые концепции усвоены.' },
    { studentIdx: 1, score: 32, answers: [1, 2, 1, 0], feedback: 'Хороший результат. Стоит повторить тему Virtual DOM.' },
    { studentIdx: 2, score: 28, answers: [0, 2, 1, 1], feedback: 'Нужно повторить useEffect и жизненный цикл компонента.' },
    { studentIdx: 3, score: 40, answers: [1, 2, 1, 1], feedback: 'Превосходно! Все ответы верны.' },
    { studentIdx: 4, score: 24, answers: [1, 0, 2, 1], feedback: 'Рекомендую перечитать раздел о управлении состоянием.' },
  ];

  for (const r of examResults) {
    const student = students[r.studentIdx];
    if (!student) continue;
    await db.collection('examAttempts').add({
      examId: exam1Ref.id,
      examTitle: 'Контрольный тест: React & Hooks',
      organizationId: orgId,
      studentId: student.uid,
      studentName: student.name,
      score: r.score,
      maxScore: 40,
      percentage: Math.round((r.score / 40) * 100),
      passed: r.score >= 24,
      answers: r.answers,
      aiFeedback: {
        summary: r.feedback,
        strengths: ['Понимание хуков', 'Работа с компонентами'],
        improvements: ['Virtual DOM', 'Оптимизация ре-рендеров'],
        generatedAt: daysFromNow(-3),
      },
      submittedAt: daysFromNow(-3),
      completedAt: daysFromNow(-3),
    });
  }
  console.log('✅ Exams & results created');

  // --- Create notifications ---
  console.log('🔔 Creating notifications...');
  const notifMessages = [
    { text: 'Диана Камилова сдала домашнее задание', type: 'homework', targetId: teacherUid },
    { text: 'Тимур Рахманов присоединился к курсу', type: 'enrollment', targetId: teacherUid },
    { text: 'Новая оценка по заданию "Счётчик с историей": 14/15', type: 'grade', targetId: students[0]?.uid },
    { text: 'Завтра в 11:00 контрольный Quiz: JS', type: 'reminder', targetId: teacherUid },
  ];
  for (const n of notifMessages) {
    if (!n.targetId) continue;
    await db.collection('notifications').add({
      ...n,
      organizationId: orgId,
      read: false,
      createdAt: hoursFromNow(-Math.floor(Math.random() * 24)),
    });
  }

  console.log('\n✅ Rich demo data seeded!');
  console.log('👨‍🏫 Owner/Teacher: e.smirnova@planula.demo / DemoPassword123!');
  console.log('👨‍🏫 Teacher 2: a.ivanov@planula.demo / DemoPassword123!');
  console.log('🎓 Student: d.kamilova@planula.demo / DemoPassword123!');
}

main().catch(err => { console.error(err); process.exit(1); });
