import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

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

const DEMO_USERS = [
  // 👨‍🏫 TEACHERS
  { email: 'e.smirnova@planula.demo', name: 'Елена Смирнова', role: 'teacher',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=200' },
  { email: 'a.ivanov@planula.demo', name: 'Алексей Иванов', role: 'teacher',
    avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=200' },
  // 🎓 STUDENTS
  { email: 'd.kamilova@planula.demo', name: 'Диана Камилова', role: 'student',
    avatar: 'https://images.unsplash.com/photo-1607746882042-944635dfe10e?auto=format&fit=crop&q=80&w=200' },
  { email: 't.rahmanov@planula.demo', name: 'Тимур Рахманов', role: 'student',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=200' },
  { email: 'a.murat@planula.demo', name: 'Алина Муратова', role: 'student',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=200' },
  { email: 's.bekov@planula.demo', name: 'Санжар Беков', role: 'student',
    avatar: 'https://api.dicebear.com/7.x/notionists/svg?seed=Sanjar&backgroundColor=b6e3f4' },
  { email: 'm.kalykov@planula.demo', name: 'Марат Калыков', role: 'student',
    avatar: 'https://api.dicebear.com/7.x/notionists/svg?seed=Marat&backgroundColor=c0aede' }
];

async function createOrGetUser(u: any, orgId: string) {
  let uid: string;
  try {
    const userRecord = await auth.createUser({
      email: u.email,
      password: 'DemoPassword123!',
      displayName: u.name,
    });
    uid = userRecord.uid;
  } catch (e: any) {
    if (e.code === 'auth/email-already-exists') {
      const existing = await auth.getUserByEmail(u.email);
      uid = existing.uid;
      // Also update auth display name
      await auth.updateUser(uid, { displayName: u.name });
    } else {
      throw e;
    }
  }

  // Ensure DB Record
  await db.collection('users').doc(uid).set({
    uid,
    email: u.email,
    displayName: u.name,
    role: u.role,
    organizationId: orgId,
    activeOrgId: orgId,
    avatarUrl: u.avatar,
    createdAt: now(),
    updatedAt: now()
  }, { merge: true });

  // 1. User -> Memberships (for auth & scope)
  await db.collection('users').doc(uid).collection('memberships').doc(orgId).set({
    organizationId: orgId,
    organizationName: 'Planula',
    role: u.role,
    status: 'active',
    joinedAt: now(),
  });

  // 2. Org -> Members (for dashboard lists)
  await db.collection('orgMembers').doc(orgId).collection('members').doc(uid).set({
    userId: uid,
    userEmail: u.email,
    userName: u.name,
    role: u.role,
    status: 'active',
    joinedAt: now()
  });

  return { ...u, uid };
}

async function main() {
  console.log('🚀 Setting up Planula presentation data...');

  const orgsRef = db.collection('organizations');
  const snapshot = await orgsRef.where('name', '==', 'Planula').limit(1).get();

  if (snapshot.empty) {
    console.error('❌ Planula organization not found! Run seed-planula.ts first.');
    process.exit(1);
  }

  const orgId = snapshot.docs[0].id;
  console.log(`📌 Found Planula: ${orgId}`);

  // 1. Create Users
  console.log('👥 Creating Demo Users...');
  const users = [];
  for (const u of DEMO_USERS) {
    users.push(await createOrGetUser(u, orgId));
  }

  const teachers = users.filter(u => u.role === 'teacher');
  const students = users.filter(u => u.role === 'student');

  // 2. Clear Demo Data (HW, Rooms) for fresh slate
  const clearCollections = ['homework_submissions', 'quizSessions'];
  for (const c of clearCollections) {
    const snaps = await db.collection(c).where('organizationId', '==', orgId).get();
    for (const d of snaps.docs) await d.ref.delete();
  }

  // 3. Setup Course and Group 
  console.log('📚 Setting up Course & Group...');
  // Find a course or create one
  let courseId;
  const courseQ = await db.collection('courses').where('organizationId', '==', orgId).limit(1).get();
  if (courseQ.empty) {
    const courseRef = db.collection('courses').doc();
    courseId = courseRef.id;
    await courseRef.set({
      title: 'Frontend-разработка: React & Node.js',
      description: 'Интенсивный курс',
      organizationId: orgId,
      status: 'published',
      teacherIds: [teachers[0].uid],
      createdAt: now()
    });
  } else {
    courseId = courseQ.docs[0].id;
    await db.collection('courses').doc(courseId).update({ 
      title: 'Frontend-разработка: React & Node.js',
      teacherIds: [teachers[0].uid]
    });
  }

  // Group
  let groupId;
  const groupQ = await db.collection('groups').where('organizationId', '==', orgId).limit(1).get();
  if (groupQ.empty) {
    const ref = db.collection('groups').doc();
    groupId = ref.id;
  } else {
    groupId = groupQ.docs[0].id;
  }
  await db.collection('groups').doc(groupId).set({
    name: 'Группа F-42 (Интенсив)',
    organizationId: orgId,
    courseId: courseId,
    teacherIds: [teachers[0].uid],
    studentIds: students.map(s => s.uid),
    status: 'active',
    updatedAt: now()
  }, { merge: true });

  // 4. Create Lessons & Homework
  console.log('📖 Generating Lessons & Homework...');
  const lessonsRef = db.collection('lessonPlans');
  const d1 = new Date(); d1.setDate(d1.getDate() - 2);
  const d2 = new Date(); d2.setDate(d2.getDate() + 2);

  const lessonSnap = await lessonsRef.where('organizationId', '==', orgId).limit(1).get();
  let lessonId;
  if(lessonSnap.empty) {
    const ref = lessonsRef.doc();
    lessonId = ref.id;
    await ref.set({
      title: 'Основы React Hooks (useContext, useReducer)',
      organizationId: orgId,
      courseId: courseId,
      authorId: teachers[0].uid,
      authorName: teachers[0].name,
      status: 'published',
      homework: {
        title: 'Создание ToDo с LocalStorage',
        description: 'Применить useReducer для стейта.',
        dueDate: d2.toISOString(),
        points: 10
      },
      createdAt: now(),
      updatedAt: now()
    });
  } else {
    lessonId = lessonSnap.docs[0].id;
    await lessonsRef.doc(lessonId).update({
      title: 'Основы React Hooks (useContext, useReducer)',
      homework: {
        title: 'Создание ToDo с LocalStorage',
        description: 'Реализуйте корзину товаров через Context API.',
        points: 20
      }
    });
  }

  // 5. Populate Kanban (Homework Submissions)
  console.log('📋 Creating Homework Submissions for Kanban...');
  const hwRef = db.collection('homework_submissions');
  
  // Pending
  await hwRef.add({
    lessonId, lessonTitle: 'Основы React Hooks',
    studentId: students[0].uid, studentName: students[0].name,
    organizationId: orgId,
    content: 'Загружен архив src.zip',
    status: 'pending',
    attachments: [{ url: '#', type: 'archive', name: 'src.zip', size: 12500 }],
    submittedAt: d1.toISOString()
  });

  // Reviewing
  await hwRef.add({
    lessonId, lessonTitle: 'Основы React Hooks',
    studentId: students[1].uid, studentName: students[1].name,
    organizationId: orgId,
    content: 'Скинул ссылку на гитхаб. Там все компоненты готовы.',
    status: 'reviewing',
    submittedAt: d1.toISOString()
  });
  
  await hwRef.add({
    lessonId, lessonTitle: 'Основы React Hooks',
    studentId: students[2].uid, studentName: students[2].name,
    organizationId: orgId,
    content: 'Задание выполнено, скриншоты во вложении',
    status: 'reviewing',
    attachments: [{ url: '#', type: 'image', name: 'demo.png', size: 50000 }],
    submittedAt: d1.toISOString()
  });

  // Graded
  let gradedDate = new Date();
  await hwRef.add({
    lessonId, lessonTitle: 'Основы React Hooks',
    studentId: students[3].uid, studentName: students[3].name,
    organizationId: orgId,
    content: 'Всё сделал!',
    status: 'graded',
    finalScore: 18,
    maxPoints: 20,
    teacherFeedback: 'Хорошая структура, но не хватает обработки ошибок сети.',
    submittedAt: d1.toISOString(),
    gradedAt: gradedDate.toISOString()
  });

  // 6. Setup Kahoot / Live Session Environment
  console.log('🎮 Setting up Mock Quiz & Live Session...');
  const examRef = db.collection('exams').doc();
  await examRef.set({
    title: 'Быстрый Quiz: JS/React Core',
    organizationId: orgId,
    courseId: courseId,
    teacherId: teachers[0].uid,
    status: 'published',
    questions: [
      { id: 'q1', type: 'multiple_choice', text: 'Зачем нужен useEffect?', options: ['Side effects', 'UI', 'State', 'Props'], correctAnswer: 0, points: 10 }
    ],
    duration: 15,
    createdAt: now()
  });

  // Create an active quiz session
  await db.collection('quizSessions').add({
    hostId: teachers[0].uid,
    hostName: teachers[0].name,
    organizationId: orgId,
    quizId: examRef.id,
    quizTitle: 'Быстрый Quiz: JS/React Core',
    mode: 'competition',
    status: 'in_progress',
    code: '852934',
    participantCount: 3,
    currentQuestionIndex: 0,
    totalQuestions: 1,
    settings: {
        randomizeQuestions: false,
        showLeaderboard: true,
        showAnswerCorrectness: true
    },
    startedAt: now(),
    createdAt: now(),
    updatedAt: now()
  }).then(async (docRef) => {
      // Add participants to subcollection
      const batch = db.batch();
      
      const p1 = docRef.collection('participants').doc(students[0].uid);
      batch.set(p1, { id: students[0].uid, participantName: students[0].name, joinedAt: now(), score: 450, rank: 1 });
      
      const p2 = docRef.collection('participants').doc(students[1].uid);
      batch.set(p2, { id: students[1].uid, participantName: students[1].name, joinedAt: now(), score: 600, rank: 2 });
      
      const p3 = docRef.collection('participants').doc(students[2].uid);
      batch.set(p3, { id: students[2].uid, participantName: students[2].name, joinedAt: now(), score: 320, rank: 3 });

      await batch.commit();
  });

  console.log('✅ Demo Data Seeded! You can now log in with:');
  console.log(`👨‍🏫 Teacher: ${teachers[0].email} / DemoPassword123!`);
  console.log(`🎓 Student: ${students[0].email} / DemoPassword123!`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
