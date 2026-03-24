/**
 * Seed script — populates Firestore with realistic fake data for testing.
 *
 * Run:  node scripts/seed.js
 *
 * Creates:
 *  - 20 organizations
 *  - 30 teachers + 70 students (Firebase Auth + Firestore)
 *  - ~60 courses, ~40 groups, ~80 lessons, ~40 exams
 */

require('dotenv').config();

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

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

// ─── DATA POOLS ───
const CITIES = ['Бишкек','Ош','Джалал-Абад','Каракол','Токмок','Бишкек','Бишкек','Ош','Нарын','Талас','Балыкчи','Кара-Балта','Бишкек','Бишкек','Ош','Бишкек','Бишкек','Ош','Каракол','Бишкек'];
const ORG_NAMES = ['Академия Знаний «Билим»','IT-School Ala-Too','Центр образования «Прогресс»','Языковая школа LinguaPro','Математическая школа «Пифагор»','Учебный центр «Успех»','Школа программирования CodeKG','Центр подготовки «Олимп»','Академия дизайна CreativeHub','Школа бизнеса StartUp Academy','Учебный центр «Эрудит»','Физ-мат лицей «Формула»','Школа робототехники RoboKids','Языковой центр Polyglot','Музыкальная академия «Гармония»','Спортивная школа «Чемпион»','Центр «Нано-Образование»','IT Academy Bishkek','Школа искусств «Вдохновение»','Научный центр «Квантум»'];
const ORG_DESCS = [
  'Современный учебный центр с индивидуальным подходом к каждому ученику.',
  'Обучаем программированию, веб-разработке и Data Science.',
  'Подготовка к ОРТ, международным экзаменам и олимпиадам.',
  'Английский, немецкий, китайский и корейский языки.',
  'Углублённое изучение математики для олимпиадников.',
  'Комплексное образование для школьников и взрослых. 50+ программ.',
  'Полный стек: HTML, CSS, JS, React, Node.js, Python.',
  'Подготовка к ОРТ и НЦТ с гарантией результата.',
  'UX/UI, графический дизайн, 3D. Adobe Suite, Figma, Blender.',
  'MBA, маркетинг, финансы, управление проектами.',
  'Репетиторский центр по всем школьным предметам.',
  'Олимпиадная математика и физика. IJSO, IPhO, IMO.',
  'Arduino, LEGO Mindstorms, 3D-печать, Scratch.',
  'IELTS, TOEFL, TestDaF. Cредний балл: IELTS 7.5.',
  'Фортепиано, гитара, вокал, музыкальная теория.',
  'Единоборства, плавание, гимнастика, лёгкая атлетика.',
  'STEM нового поколения. VR/AR лаборатории.',
  'Полный курс IT: от основ до трудоустройства за 6 месяцев.',
  'Живопись, скульптура, керамика, фотография.',
  'Научные лагеря, лаборатории, исследования для детей.',
];
const SUBJECTS = [['Математика','Физика','Информатика'],['Python','JavaScript','React','Node.js'],['ОРТ','Математика','Аналогия'],['English','Deutsch','中文'],['Алгебра','Геометрия','Теория чисел'],['Математика','Русский','English'],['HTML/CSS','JavaScript','React'],['ОРТ','НЦТ','Математика'],['Figma','Photoshop','Illustrator'],['Маркетинг','Финансы','Менеджмент'],['Математика','Русский','English'],['Олимп. математика','Олимп. физика'],['Arduino','Scratch','Python'],['IELTS','TOEFL','Grammar'],['Фортепиано','Гитара','Вокал'],['Карате','Плавание','Гимнастика'],['Физика','Химия','Биология'],['Java','C++','SQL'],['Живопись','Скульптура','Фото'],['Химия','Биология','Экология']];
const HOURS = ['Пн-Пт 09:00-18:00, Сб 10:00-15:00','Пн-Сб 08:00-20:00','Пн-Пт 10:00-19:00','Ежедневно 09:00-21:00','Пн-Пт 08:30-17:30'];
const ADDRS = ['ул. Киевская 120','пр. Чуй 168','ул. Абдрахманова 150','мкр. Аламедин-1 д.44','ул. Токтогула 92','пр. Манаса 40','ул. Боконбаева 55','ул. Панфилова 188','ул. Московская 75','ул. Жибек Жолу 428','ул. Исанова 79','ул. Фрунзе 330','мкр. Джал 29/1','ул. Горького 100','ул. Тыныстанова 225','ул. Байтик Баатыра 15','пр. Жибек Жолу 555','ул. Сыдыгалиева 25','ул. Раззакова 44','ул. Ахунбаева 80'];
const MN = ['Айбек','Султан','Азат','Нурлан','Бекзат','Данияр','Эрмек','Кубат','Тилек','Адилет','Арген','Бакыт','Чыңгыз','Досбол','Эльдар','Жаныбек','Канат','Марат','Нурбек','Руслан','Санжар','Таалай','Улан','Жаркын','Айдын','Болот','Дастан','Исламбек','Кубанычбек','Мелис'];
const FN = ['Айдай','Айзере','Алтынай','Асель','Бермет','Чолпон','Дана','Элнура','Гулнара','Жамиля','Каныкей','Мадина','Назира','Нургуль','Салтанат','Сыргак','Толкун','Замира','Жылдыз','Айнура','Бегимай','Дарья','Элеонора','Фатима','Индира','Курманжан','Лейла','Мээрим','Нурзат','Сауле'];
const LN = ['Исмаилов','Абдыкеримов','Токтосунов','Осмонов','Бакашов','Усенов','Сыдыков','Бектенов','Молдалиев','Асанов','Женишбеков','Кожомкулов','Тургунбаев','Мамытов','Алымбеков','Джунусов','Калыков','Тентимишов','Сагынбаев','Орозбаев','Рыскулов','Садырбаев','Жумаев','Касымов','Байтов','Чороев','Дооронбеков','Эркинбеков','Ниязов','Жороев'];
const COURSES = [
  {t:'Основы программирования',d:'Изучение базовых концепций на Python.'},{t:'Веб-разработка с нуля',d:'HTML, CSS, JS — полный курс.'},{t:'Продвинутая математика',d:'Алгебра и теория чисел.'},{t:'Английский B1-B2',d:'Интенсив для перехода на средний уровень.'},{t:'Подготовка к ОРТ',d:'Все разделы ОРТ + пробные тесты.'},{t:'UX/UI Design',d:'Figma, прототипирование, портфолио.'},{t:'Data Science',d:'Python, pandas, ML, визуализация.'},{t:'Кыргызский язык',d:'Грамматика и разговорная практика.'},{t:'Физика для абитуриентов',d:'Механика, электричество, оптика.'},{t:'Робототехника',d:'Arduino, LEGO, Scratch.'},{t:'IELTS Preparation',d:'Listening, Reading, Writing, Speaking.'},{t:'Графический дизайн',d:'Photoshop, Illustrator, типографика.'},{t:'React.js',d:'Компоненты, хуки, роутинг, Redux.'},{t:'История Кыргызстана',d:'От древности до современности.'},{t:'Биология',d:'Молекулярная биология, генетика.'},{t:'Digital Marketing',d:'SMM, SEO, контекстная реклама.'},{t:'Музыкальная теория',d:'Нотная грамота, гармония.'},{t:'Финансовая грамотность',d:'Бюджет, инвестиции, налоги.'},{t:'Химия',d:'Неорганическая и органическая.'},{t:'Русский язык',d:'Грамматика, синтаксис, анализ.'}
];
const LESSONS = ['Введение','Основные понятия','Практика №1','Теория','Решение задач','Лабораторная','Контрольная','Повторение','Проект','Презентация','Разбор ошибок','Углублённая тема','Подготовка к экзамену','Итоговое','Дискуссия','Мастер-класс','Семинар','Групповая работа','Консультация','Финальная проверка'];
const EXAMS = ['Вступительный тест','Промежуточный экзамен','Финальный экзамен','Пробный ОРТ','Тест по грамматике','Контрольная по математике','Quiz: программирование','Тест по физике','IELTS Mock','Проверка знаний','Мини-тест','Итоговая аттестация'];
const GROUPS = ['Группа А','Группа Б','Группа В','Утренняя','Вечерняя','Продвинутая','Начинающие','Интенсив','Weekend','VIP','Олимпиадная','Онлайн-поток'];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pickN(arr, n) { return [...arr].sort(() => Math.random() - 0.5).slice(0, n); }
function slug(s) { return s.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').replace(/^-|-$/g, '').substring(0, 40); }
function phone() { return `+996${pick(['700','701','702','770','771','772','555','556','557'])}${String(Math.floor(100000+Math.random()*900000))}`; }

async function createUser(name, email, role, orgId, orgName) {
  let uid;
  try {
    const r = await auth.createUser({ email, password: 'Test1234!', displayName: name, disabled: false });
    uid = r.uid;
  } catch (e) {
    if (e.code === 'auth/email-already-exists') {
      const ex = await auth.getUserByEmail(email);
      uid = ex.uid;
    } else throw e;
  }
  await db.collection('users').doc(uid).set({
    uid, email, displayName: name, role,
    organizationId: orgId, organizationName: orgName, activeOrgId: orgId,
    username: name.toLowerCase().replace(/\s+/g, '_'),
    city: pick(CITIES), country: 'Кыргызстан', phone: phone(),
    createdAt: now(), updatedAt: now(),
  }, { merge: true });
  await db.collection('memberships').add({
    userId: uid, organizationId: orgId, organizationName: orgName,
    role, status: 'active', joinedAt: now(), createdAt: now(),
  });
  return uid;
}

async function main() {
  console.log('🌱 Starting seed...\n');
  const orgs = [];

  // 1. ORGANIZATIONS
  console.log('📦 Creating 20 organizations...');
  for (let i = 0; i < 20; i++) {
    const ref = db.collection('organizations').doc();
    const s = slug(ORG_NAMES[i]) + '-' + (i+1);
    await ref.set({
      name: ORG_NAMES[i], slug: s, description: ORG_DESCS[i],
      logo: '', banner: '', city: CITIES[i], country: 'Кыргызстан',
      address: ADDRS[i], workingHours: pick(HOURS),
      isOnline: i % 4 === 0, isPublic: true, status: 'active',
      plan: i % 3 === 0 ? 'professional' : 'starter',
      subjects: SUBJECTS[i], contactEmail: `info@org${i+1}.kg`, contactPhone: phone(),
      photos: [], studentsCount: 0, teachersCount: 0, examsCount: 0,
      createdAt: now(), updatedAt: now(),
    });
    orgs.push({ id: ref.id, name: ORG_NAMES[i] });
    console.log(`  ✓ ${ORG_NAMES[i]}`);
  }

  // 2. TEACHERS
  console.log('\n👨‍🏫 Creating 30 teachers...');
  const tByOrg = {};
  for (let i = 0; i < 30; i++) {
    const first = i % 2 === 0 ? MN[i % MN.length] : FN[i % FN.length];
    const last = LN[i % LN.length];
    const o = orgs[i % 20];
    const uid = await createUser(`${first} ${last}`, `teacher${i}@planula-test.kg`, 'teacher', o.id, o.name);
    if (!tByOrg[o.id]) tByOrg[o.id] = [];
    tByOrg[o.id].push(uid);
    console.log(`  ✓ ${first} ${last} → ${o.name}`);
  }
  for (const o of orgs) await db.collection('organizations').doc(o.id).update({ teachersCount: (tByOrg[o.id]||[]).length });

  // 3. STUDENTS
  console.log('\n🎓 Creating 70 students...');
  const sByOrg = {};
  for (let i = 0; i < 70; i++) {
    const first = i % 3 !== 0 ? MN[i % MN.length] : FN[i % FN.length];
    const last = LN[(i+5) % LN.length];
    const o = orgs[i % 20];
    const uid = await createUser(`${first} ${last}`, `student${i}@planula-test.kg`, 'student', o.id, o.name);
    if (!sByOrg[o.id]) sByOrg[o.id] = [];
    sByOrg[o.id].push(uid);
    if (i % 10 === 0) console.log(`  ✓ ${i+1}/70...`);
  }
  console.log('  ✓ 70/70 done');
  for (const o of orgs) await db.collection('organizations').doc(o.id).update({ studentsCount: (sByOrg[o.id]||[]).length });

  // 4. COURSES (3 per org)
  console.log('\n📚 Creating courses...');
  const cByOrg = {};
  for (const o of orgs) {
    cByOrg[o.id] = [];
    for (const c of pickN(COURSES, 3)) {
      const ref = db.collection('courses').doc();
      await ref.set({
        title: c.t, name: c.t, description: c.d,
        organizationId: o.id, teacherId: (tByOrg[o.id]||[''])[0],
        status: 'active', studentsCount: (sByOrg[o.id]||[]).length,
        createdAt: now(), updatedAt: now(),
      });
      cByOrg[o.id].push(ref.id);
    }
  }
  console.log(`  ✓ ${Object.values(cByOrg).flat().length} courses`);

  // 5. GROUPS (2 per org)
  console.log('\n👥 Creating groups...');
  let gTotal = 0;
  for (const o of orgs) {
    for (const gn of pickN(GROUPS, 2)) {
      await db.collection('groups').doc().set({
        name: gn, organizationId: o.id,
        courseId: (cByOrg[o.id]||[''])[0], teacherId: (tByOrg[o.id]||[''])[0],
        studentIds: (sByOrg[o.id]||[]).slice(0,5), studentsCount: Math.min((sByOrg[o.id]||[]).length, 5),
        status: 'active', createdAt: now(), updatedAt: now(),
      });
      gTotal++;
    }
  }
  console.log(`  ✓ ${gTotal} groups`);

  // 6. LESSON PLANS (4 per org)
  console.log('\n📖 Creating lessons...');
  let lTotal = 0;
  for (const o of orgs) {
    for (let l = 0; l < 4; l++) {
      await db.collection('lessonPlans').doc().set({
        title: LESSONS[(l + orgs.indexOf(o)) % LESSONS.length],
        content: 'Теоретическая часть и практические задания.',
        organizationId: o.id, courseId: (cByOrg[o.id]||[''])[l % 3],
        teacherId: (tByOrg[o.id]||[''])[0], duration: pick([30,45,60,90]),
        status: 'published', attachments: [], createdAt: now(), updatedAt: now(),
      });
      lTotal++;
    }
  }
  console.log(`  ✓ ${lTotal} lessons`);

  // 7. EXAMS (2 per org)
  console.log('\n📝 Creating exams...');
  let eTotal = 0;
  for (const o of orgs) {
    for (const en of pickN(EXAMS, 2)) {
      const qs = Array.from({length: pick([5,10,15])}, (_,qi) => ({
        id: `q${qi+1}`, text: `Вопрос ${qi+1}`, type: 'multiple_choice',
        options: ['A','B','C','D'], correctAnswer: pick([0,1,2,3]), points: pick([1,2,5]),
      }));
      await db.collection('exams').doc().set({
        title: en, organizationId: o.id, courseId: (cByOrg[o.id]||[''])[0],
        teacherId: (tByOrg[o.id]||[''])[0], questions: qs,
        duration: pick([15,30,45,60]), passingScore: pick([50,60,70]),
        maxAttempts: pick([1,2,3]), status: 'published', createdAt: now(), updatedAt: now(),
      });
      eTotal++;
    }
    await db.collection('organizations').doc(o.id).update({ examsCount: 2 });
  }
  console.log(`  ✓ ${eTotal} exams`);

  // 8. ORG SETTINGS
  console.log('\n⚙️  Creating org settings...');
  for (const o of orgs) {
    await db.collection('orgSettings').doc(o.id).set({
      timezone: 'Asia/Bishkek', locale: 'ru',
      academicYearStart: '2025-09-01', academicYearEnd: '2026-06-30',
      gradingScale: 'percentage', passingScore: 60, updatedAt: now(),
    }, { merge: true });
  }

  console.log('\n═══════════════════════════════════════');
  console.log('✅ SEED COMPLETE!');
  console.log('═══════════════════════════════════════');
  console.log('  Orgs:     20');
  console.log('  Teachers: 30');
  console.log('  Students: 70');
  console.log(`  Courses:  ${Object.values(cByOrg).flat().length}`);
  console.log(`  Groups:   ${gTotal}`);
  console.log(`  Lessons:  ${lTotal}`);
  console.log(`  Exams:    ${eTotal}`);
  console.log('\n  Password for all users: Test1234!');
  console.log('═══════════════════════════════════════\n');
}

main().catch(e => { console.error('❌ Failed:', e); process.exit(1); });
