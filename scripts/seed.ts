/**
 * Seed script — populates Firestore with realistic fake data for testing.
 *
 * Run:  npx tsx scripts/seed.ts
 *
 * Creates:
 *  - 20 organizations (public, with logos, descriptions, contacts)
 *  - 30 teachers (distributed across orgs)
 *  - 70 students (distributed across orgs)
 *  - ~60 courses (3 per org)
 *  - ~40 groups (2 per org)
 *  - ~80 lesson plans (4 per org)
 *  - ~40 exams (2 per org)
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// Load .env from project root
const dotenv = require('dotenv');
const path = require('path');
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

/* ═══════════════════════════════════════════════ */
/*  DATA POOLS                                     */
/* ═══════════════════════════════════════════════ */

const CITIES = [
  'Бишкек', 'Ош', 'Джалал-Абад', 'Каракол', 'Токмок',
  'Бишкек', 'Бишкек', 'Ош', 'Нарын', 'Талас',
  'Балыкчи', 'Кара-Балта', 'Бишкек', 'Бишкек', 'Ош',
  'Бишкек', 'Бишкек', 'Ош', 'Каракол', 'Бишкек',
];

const ORG_NAMES = [
  'Академия Знаний «Билим»', 'IT-School Ala-Too', 'Центр образования «Прогресс»',
  'Языковая школа LinguaPro', 'Математическая школа «Пифагор»',
  'Учебный центр «Успех»', 'Школа программирования CodeKG',
  'Центр подготовки «Олимп»', 'Академия дизайна CreativeHub',
  'Школа бизнеса StartUp Academy', 'Учебный центр «Эрудит»',
  'Физико-математический лицей «Формула»', 'Школа робототехники RoboKids',
  'Языковой центр Polyglot', 'Музыкальная академия «Гармония»',
  'Спортивная школа «Чемпион»', 'Центр «Нано-Образование»',
  'IT Academy Bishkek', 'Школа искусств «Вдохновение»',
  'Научный центр «Квантум»',
];

const ORG_DESCRIPTIONS = [
  'Современный учебный центр с индивидуальным подходом к каждому ученику. Наши преподаватели — эксперты с многолетним опытом.',
  'Обучаем программированию, веб-разработке и Data Science. Практический подход с реальными проектами.',
  'Подготовка к ОРТ, международным экзаменам и олимпиадам. Гарантируем высокие результаты.',
  'Английский, немецкий, китайский и корейский языки. Носители языка в штате. Онлайн и офлайн формат.',
  'Углублённое изучение математики, подготовка к олимпиадам и поступлению в ведущие вузы мира.',
  'Комплексное образование для школьников и взрослых. Более 50 программ обучения.',
  'Полный стек веб-разработки: HTML, CSS, JS, React, Node.js, Python. Трудоустройство после курса.',
  'Подготовка к ОРТ и НЦТ с гарантией результата. Пробные тесты каждую неделю.',
  'UX/UI дизайн, графический дизайн, 3D-моделирование. Adobe Suite, Figma, Blender.',
  'MBA программа, маркетинг, финансы, управление проектами. Менторство от действующих предпринимателей.',
  'Репетиторский центр по всем школьным предметам. Группы до 6 человек.',
  'Олимпиадная математика и физика. Подготовка к IJSO, IPhO, IMO.',
  'Arduino, LEGO Mindstorms, 3D-печать, программирование для детей 7-16 лет.',
  'IELTS, TOEFL, TestDaF подготовка. Средний балл наших учеников: IELTS 7.5.',
  'Фортепиано, гитара, вокал, музыкальная теория. Для детей и взрослых.',
  'Единоборства, плавание, гимнастика, лёгкая атлетика. Профессиональные тренеры.',
  'STEM-образование нового поколения. VR/AR лаборатории, нанотехнологии.',
  'Полный курс IT: от основ до трудоустройства за 6 месяцев. Партнёрство с компаниями.',
  'Живопись, скульптура, керамика, фотография. Мастер-классы от известных художников.',
  'Научные лагеря, лаборатории, исследовательские проекты для детей и подростков.',
];

const SUBJECTS_POOL = [
  ['Математика', 'Физика', 'Информатика'],
  ['Python', 'JavaScript', 'React', 'Node.js'],
  ['ОРТ', 'Математика', 'Аналогия', 'Чтение'],
  ['English', 'Deutsch', '中文', '한국어'],
  ['Алгебра', 'Геометрия', 'Теория чисел'],
  ['Математика', 'Русский', 'English', 'История'],
  ['HTML/CSS', 'JavaScript', 'React', 'Python'],
  ['ОРТ', 'НЦТ', 'Математика', 'Физика'],
  ['Figma', 'Photoshop', 'Illustrator', 'Blender'],
  ['Маркетинг', 'Финансы', 'Менеджмент'],
  ['Математика', 'Русский', 'Кыргызский', 'English'],
  ['Олимпиадная математика', 'Олимпиадная физика'],
  ['Arduino', 'Scratch', 'Python', '3D-печать'],
  ['IELTS', 'TOEFL', 'Grammar', 'Speaking'],
  ['Фортепиано', 'Гитара', 'Вокал', 'Сольфеджио'],
  ['Карате', 'Плавание', 'Гимнастика'],
  ['Физика', 'Химия', 'Биология', 'VR'],
  ['Java', 'C++', 'SQL', 'DevOps'],
  ['Живопись', 'Скульптура', 'Фотография'],
  ['Химия', 'Биология', 'Экология'],
];

const WORKING_HOURS = [
  'Пн-Пт 09:00-18:00, Сб 10:00-15:00',
  'Пн-Сб 08:00-20:00',
  'Пн-Пт 10:00-19:00',
  'Ежедневно 09:00-21:00',
  'Пн-Пт 08:30-17:30, Сб 09:00-14:00',
];

const ADDRESSES = [
  'ул. Киевская 120, 3 этаж', 'пр. Чуй 168, оф. 5', 'ул. Абдрахманова 150',
  'мкр. Аламедин-1, д. 44', 'ул. Токтогула 92', 'пр. Манаса 40, БЦ "Манас"',
  'ул. Боконбаева 55', 'ул. Панфилова 188', 'ул. Московская 75',
  'ул. Жибек Жолу 428', 'ул. Исанова 79', 'ул. Фрунзе 330',
  'мкр. Джал 29/1', 'ул. Горького 100', 'ул. Тыныстанова 225',
  'ул. Байтик Баатыра 15', 'пр. Жибек Жолу 555', 'ул. Сыдыгалиева 25',
  'ул. Раззакова 44', 'ул. Ахунбаева 80',
];

const FIRST_NAMES_M = ['Aibek', 'Sultan', 'Azat', 'Nurlan', 'Bekzat', 'Daniyar', 'Ermek', 'Kubat', 'Tilek', 'Adilet', 'Argen', 'Bakyt', 'Chyngyz', 'Dosbol', 'Eldar', 'Zhanybek', 'Kanat', 'Marat', 'Nurbek', 'Ruslan', 'Sanjar', 'Taalai', 'Ulan', 'Zharkyn', 'Aidyn', 'Bolot', 'Dastan', 'Islambek', 'Kubanychbek', 'Melis'];
const FIRST_NAMES_F = ['Aidai', 'Aizere', 'Altynai', 'Asel', 'Bermet', 'Cholpon', 'Dana', 'Elnura', 'Gulnara', 'Jamilya', 'Kanykei', 'Madina', 'Nazira', 'Nurgul', 'Saltanat', 'Syrgak', 'Tolkun', 'Zamira', 'Zhyldyz', 'Ainura', 'Begimay', 'Daria', 'Eleonora', 'Fatima', 'Indira', 'Kurmanzhan', 'Leila', 'Meerim', 'Nurzat', 'Saule'];
const LAST_NAMES = ['Ismailov', 'Abdykerimov', 'Toktosunov', 'Osmonov', 'Bakashov', 'Usenov', 'Sydykov', 'Bektenov', 'Moldaliev', 'Asanov', 'Zhenishbekov', 'Kozhomkulov', 'Turgunbaev', 'Mamytov', 'Alymbekov', 'Dzhunusov', 'Kalykov', 'Tentimishov', 'Sagynbaev', 'Orozbaev', 'Ryskulov', 'Sadyrbaev', 'Jumaev', 'Kasymov', 'Baitov', 'Choroev', 'Dooronbekov', 'Erkinbekov', 'Niyazov', 'Zhoroev'];

const COURSE_TEMPLATES = [
  { title: 'Основы программирования', desc: 'Изучение базовых концепций программирования на Python.' },
  { title: 'Веб-разработка с нуля', desc: 'HTML, CSS, JavaScript — полный курс для начинающих.' },
  { title: 'Продвинутая математика', desc: 'Алгебра, геометрия и теория чисел для олимпиадников.' },
  { title: 'Английский язык B1-B2', desc: 'Интенсивный курс для перехода на средний уровень.' },
  { title: 'Подготовка к ОРТ', desc: 'Системная подготовка ко всем разделам ОРТ с пробными тестами.' },
  { title: 'UX/UI Design', desc: 'Проектирование интерфейсов в Figma с портфолио.' },
  { title: 'Data Science', desc: 'Python, pandas, машинное обучение, визуализация данных.' },
  { title: 'Кыргызский язык', desc: 'Грамматика, лексика и разговорная практика кыргызского языка.' },
  { title: 'Физика для абитуриентов', desc: 'Механика, электричество, оптика — подготовка к вузу.' },
  { title: 'Робототехника для детей', desc: 'Arduino, LEGO, программирование в Scratch.' },
  { title: 'IELTS Preparation', desc: 'Подготовка ко всем секциям IELTS: Listening, Reading, Writing, Speaking.' },
  { title: 'Графический дизайн', desc: 'Photoshop, Illustrator, основы композиции и типографики.' },
  { title: 'React.js для разработчиков', desc: 'Компоненты, хуки, роутинг, Redux — всё о React.' },
  { title: 'История Кыргызстана', desc: 'От древности до современности. Подготовка к экзаменам.' },
  { title: 'Биология для олимпиадников', desc: 'Молекулярная биология, генетика, экология.' },
  { title: 'Digital Marketing', desc: 'SMM, SEO, контекстная реклама, email-маркетинг.' },
  { title: 'Музыкальная теория', desc: 'Нотная грамота, гармония, сольфеджио.' },
  { title: 'Финансовая грамотность', desc: 'Бюджет, инвестиции, налоги для школьников и студентов.' },
  { title: 'Химия — базовый курс', desc: 'Неорганическая и органическая химия с лабораторными.' },
  { title: 'Русский язык и литература', desc: 'Грамматика, синтаксис, анализ произведений.' },
];

const LESSON_TITLES = [
  'Введение в курс', 'Основные понятия', 'Практическое занятие №1',
  'Теоретические основы', 'Решение задач', 'Лабораторная работа',
  'Контрольная работа', 'Повторение материала', 'Проектная работа',
  'Презентация проектов', 'Разбор ошибок', 'Углублённая тема',
  'Подготовка к экзамену', 'Итоговое занятие', 'Дискуссия',
  'Мастер-класс', 'Семинар', 'Групповая работа',
  'Индивидуальные консультации', 'Финальная проверка',
];

const EXAM_NAMES = [
  'Вступительный тест', 'Промежуточный экзамен', 'Финальный экзамен',
  'Пробный ОРТ', 'Тест по грамматике', 'Контрольная по математике',
  'Quiz: основы программирования', 'Тест по физике', 'IELTS Mock',
  'Проверка знаний', 'Мини-тест', 'Итоговая аттестация',
];

const GROUP_NAMES = [
  'Группа А', 'Группа Б', 'Группа В', 'Утренняя', 'Вечерняя',
  'Продвинутая', 'Начинающие', 'Интенсив', 'Weekend', 'VIP',
  'Олимпиадная', 'Онлайн-поток', 'Офлайн-поток', 'Pro',
];

/* ═══════════════════════════════════════════════ */
/*  HELPERS                                        */
/* ═══════════════════════════════════════════════ */

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}
function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-zа-яёa-z0-9]+/gi, '-').replace(/^-|-$/g, '').substring(0, 40);
}
function randomEmail(first: string, last: string): string {
  return `${first.toLowerCase()}.${last.toLowerCase()}@planula-test.kg`;
}
function randomPhone(): string {
  const codes = ['700', '701', '702', '703', '704', '705', '706', '707', '708', '709', '770', '771', '772', '773', '774', '775', '776', '777', '778', '779'];
  return `+996${pick(codes)}${String(Math.floor(100000 + Math.random() * 900000))}`;
}

const createdUserUids: string[] = [];

async function createFakeUser(displayName: string, email: string, role: string, orgId: string, orgName: string): Promise<string> {
  let uid: string;
  try {
    const userRecord = await auth.createUser({
      email,
      password: 'Test1234!',
      displayName,
      disabled: false,
    });
    uid = userRecord.uid;
  } catch (e: any) {
    if (e.code === 'auth/email-already-exists') {
      const existing = await auth.getUserByEmail(email);
      uid = existing.uid;
    } else {
      throw e;
    }
  }
  createdUserUids.push(uid);

  await db.collection('users').doc(uid).set({
    uid,
    email,
    displayName,
    role,
    organizationId: orgId,
    organizationName: orgName,
    activeOrgId: orgId,
    username: displayName.toLowerCase().replace(/\s+/g, '_'),
    bio: '',
    city: pick(CITIES),
    country: 'Кыргызстан',
    phone: randomPhone(),
    createdAt: now(),
    updatedAt: now(),
  }, { merge: true });

  // Create membership
  await db.collection('memberships').add({
    userId: uid,
    organizationId: orgId,
    organizationName: orgName,
    role,
    status: 'active',
    joinedAt: now(),
    createdAt: now(),
  });

  return uid;
}

/* ═══════════════════════════════════════════════ */
/*  MAIN                                           */
/* ═══════════════════════════════════════════════ */

async function main() {
  console.log('🌱 Starting seed...\n');

  const orgIds: string[] = [];
  const orgMap: { id: string; name: string }[] = [];

  // ──── 1. CREATE 20 ORGANIZATIONS ────
  console.log('📦 Creating 20 organizations...');
  for (let i = 0; i < 20; i++) {
    const name = ORG_NAMES[i];
    const s = slug(name) + '-' + (i + 1);
    const ref = db.collection('organizations').doc();
    const orgData = {
      name,
      slug: s,
      description: ORG_DESCRIPTIONS[i],
      logo: '',
      banner: '',
      city: CITIES[i],
      country: 'Кыргызстан',
      address: ADDRESSES[i],
      workingHours: pick(WORKING_HOURS),
      isOnline: i % 4 === 0,
      isPublic: true,
      status: 'active',
      plan: i % 3 === 0 ? 'professional' : 'starter',
      subjects: SUBJECTS_POOL[i],
      contactEmail: `info@${s.replace(/-/g, '')}.kg`,
      contactPhone: randomPhone(),
      photos: [],
      studentsCount: 0,
      teachersCount: 0,
      examsCount: 0,
      createdAt: now(),
      updatedAt: now(),
    };
    await ref.set(orgData);
    orgIds.push(ref.id);
    orgMap.push({ id: ref.id, name });
    console.log(`  ✓ ${name} (${CITIES[i]})`);
  }

  // ──── 2. CREATE 30 TEACHERS ────
  console.log('\n👨‍🏫 Creating 30 teachers...');
  const teachersByOrg: Record<string, string[]> = {};
  for (let i = 0; i < 30; i++) {
    const isMale = i % 2 === 0;
    const first = isMale ? FIRST_NAMES_M[i % FIRST_NAMES_M.length] : FIRST_NAMES_F[i % FIRST_NAMES_F.length];
    const last = LAST_NAMES[i % LAST_NAMES.length];
    const displayName = `${first} ${last}`;
    const orgIdx = i % 20; // distribute across orgs
    const org = orgMap[orgIdx];
    const email = randomEmail(first + i, last);

    const uid = await createFakeUser(displayName, email, 'teacher', org.id, org.name);
    if (!teachersByOrg[org.id]) teachersByOrg[org.id] = [];
    teachersByOrg[org.id].push(uid);
    console.log(`  ✓ ${displayName} → ${org.name}`);
  }

  // Update teacher counts
  for (const org of orgMap) {
    const count = teachersByOrg[org.id]?.length || 0;
    await db.collection('organizations').doc(org.id).update({ teachersCount: count });
  }

  // ──── 3. CREATE 70 STUDENTS ────
  console.log('\n🎓 Creating 70 students...');
  const studentsByOrg: Record<string, string[]> = {};
  for (let i = 0; i < 70; i++) {
    const isMale = i % 3 !== 0;
    const first = isMale ? FIRST_NAMES_M[i % FIRST_NAMES_M.length] : FIRST_NAMES_F[i % FIRST_NAMES_F.length];
    const last = LAST_NAMES[(i + 5) % LAST_NAMES.length];
    const displayName = `${first} ${last}`;
    const orgIdx = i % 20;
    const org = orgMap[orgIdx];
    const email = `student.${first.toLowerCase()}${i}@planula-test.kg`;

    const uid = await createFakeUser(displayName, email, 'student', org.id, org.name);
    if (!studentsByOrg[org.id]) studentsByOrg[org.id] = [];
    studentsByOrg[org.id].push(uid);
    if (i % 10 === 0) console.log(`  ✓ ${i + 1}/70...`);
  }
  console.log('  ✓ 70/70 students created');

  // Update student counts
  for (const org of orgMap) {
    const count = studentsByOrg[org.id]?.length || 0;
    await db.collection('organizations').doc(org.id).update({ studentsCount: count });
  }

  // ──── 4. CREATE COURSES (3 per org = ~60) ────
  console.log('\n📚 Creating courses...');
  const coursesByOrg: Record<string, string[]> = {};
  for (const org of orgMap) {
    const courses = pickN(COURSE_TEMPLATES, 3);
    coursesByOrg[org.id] = [];
    for (const c of courses) {
      const ref = db.collection('courses').doc();
      await ref.set({
        title: c.title,
        name: c.title,
        description: c.desc,
        organizationId: org.id,
        teacherId: teachersByOrg[org.id]?.[0] || '',
        status: 'active',
        studentsCount: studentsByOrg[org.id]?.length || 0,
        createdAt: now(),
        updatedAt: now(),
      });
      coursesByOrg[org.id].push(ref.id);
    }
  }
  console.log(`  ✓ ${Object.values(coursesByOrg).flat().length} courses created`);

  // ──── 5. CREATE GROUPS (2 per org = ~40) ────
  console.log('\n👥 Creating groups...');
  let totalGroups = 0;
  for (const org of orgMap) {
    const groupNames = pickN(GROUP_NAMES, 2);
    for (let g = 0; g < groupNames.length; g++) {
      const students = studentsByOrg[org.id] || [];
      const ref = db.collection('groups').doc();
      await ref.set({
        name: groupNames[g],
        organizationId: org.id,
        courseId: coursesByOrg[org.id]?.[g % (coursesByOrg[org.id]?.length || 1)] || '',
        teacherId: teachersByOrg[org.id]?.[0] || '',
        studentIds: students.slice(0, Math.min(students.length, 5)),
        studentsCount: Math.min(students.length, 5),
        status: 'active',
        createdAt: now(),
        updatedAt: now(),
      });
      totalGroups++;
    }
  }
  console.log(`  ✓ ${totalGroups} groups created`);

  // ──── 6. CREATE LESSON PLANS (4 per org = ~80) ────
  console.log('\n📖 Creating lesson plans...');
  let totalLessons = 0;
  for (const org of orgMap) {
    const lessonTitles = pickN(LESSON_TITLES, 4);
    for (let l = 0; l < lessonTitles.length; l++) {
      const ref = db.collection('lessonPlans').doc();
      await ref.set({
        title: lessonTitles[l],
        content: `Содержание урока "${lessonTitles[l]}". Теоретическая часть и практические задания для закрепления материала.`,
        organizationId: org.id,
        courseId: coursesByOrg[org.id]?.[l % (coursesByOrg[org.id]?.length || 1)] || '',
        teacherId: teachersByOrg[org.id]?.[l % (teachersByOrg[org.id]?.length || 1)] || '',
        duration: pick([30, 45, 60, 90]),
        status: 'published',
        attachments: [],
        createdAt: now(),
        updatedAt: now(),
      });
      totalLessons++;
    }
  }
  console.log(`  ✓ ${totalLessons} lesson plans created`);

  // ──── 7. CREATE EXAMS (2 per org = ~40) ────
  console.log('\n📝 Creating exams...');
  let totalExams = 0;
  for (const org of orgMap) {
    const examNames = pickN(EXAM_NAMES, 2);
    for (const examName of examNames) {
      const ref = db.collection('exams').doc();
      const questions = Array.from({ length: pick([5, 10, 15, 20]) }, (_, qi) => ({
        id: `q${qi + 1}`,
        text: `Вопрос ${qi + 1}: ${pick(['Какой правильный ответ?', 'Выберите верный вариант:', 'Решите задачу:', 'Укажите правильный ответ:'])}`,
        type: 'multiple_choice',
        options: ['Вариант A', 'Вариант B', 'Вариант C', 'Вариант D'],
        correctAnswer: pick([0, 1, 2, 3]),
        points: pick([1, 2, 5]),
      }));

      await ref.set({
        title: examName,
        organizationId: org.id,
        courseId: coursesByOrg[org.id]?.[0] || '',
        teacherId: teachersByOrg[org.id]?.[0] || '',
        questions,
        duration: pick([15, 30, 45, 60]),
        passingScore: pick([50, 60, 70]),
        maxAttempts: pick([1, 2, 3]),
        status: 'published',
        createdAt: now(),
        updatedAt: now(),
      });
      totalExams++;
    }
    // Update exam count
    await db.collection('organizations').doc(org.id).update({ examsCount: totalExams });
  }
  console.log(`  ✓ ${totalExams} exams created`);

  // ──── 8. CREATE ORG SETTINGS ────
  console.log('\n⚙️  Creating org settings...');
  for (const org of orgMap) {
    await db.collection('orgSettings').doc(org.id).set({
      timezone: 'Asia/Bishkek',
      locale: 'ru',
      academicYearStart: '2025-09-01',
      academicYearEnd: '2026-06-30',
      gradingScale: 'percentage',
      passingScore: 60,
      updatedAt: now(),
    }, { merge: true });
  }
  console.log(`  ✓ 20 org settings created`);

  // ──── SUMMARY ────
  console.log('\n═══════════════════════════════════════════');
  console.log('✅ SEED COMPLETE!');
  console.log('═══════════════════════════════════════════');
  console.log(`  Organizations: 20`);
  console.log(`  Teachers:      30`);
  console.log(`  Students:      70`);
  console.log(`  Courses:       ${Object.values(coursesByOrg).flat().length}`);
  console.log(`  Groups:        ${totalGroups}`);
  console.log(`  Lessons:       ${totalLessons}`);
  console.log(`  Exams:         ${totalExams}`);
  console.log(`  Total users:   ${createdUserUids.length}`);
  console.log('\n  All users have password: Test1234!');
  console.log('═══════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
