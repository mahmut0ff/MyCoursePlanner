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

async function main() {
  console.log('🌱 Starting Planula seeding...');

  // 1. Find or create Planula organization
  const orgsRef = db.collection('organizations');
  const snapshot = await orgsRef.where('name', '==', 'Planula').limit(1).get();

  let orgId;
  if (snapshot.empty) {
    console.log('📌 Planula not found! Creating new org...');
    const newOrgRef = orgsRef.doc();
    orgId = newOrgRef.id;
    await newOrgRef.set({
      name: 'Planula',
      slug: 'planula',
      description: 'Современный учебный центр Planula. Мы предлагаем качественное образование по самым актуальным направлениям.',
      city: 'Бишкек',
      country: 'Кыргызстан',
      address: 'ул. Киевская 120, 3 этаж',
      isPublic: true,
      status: 'active',
      createdAt: now(),
      updatedAt: now()
    });
  } else {
    orgId = snapshot.docs[0].id;
    console.log(`📌 Found Planula with ID: ${orgId}`);
  }

  // 2. Add realistic profile data
  console.log('📦 Updating profile data (photos, contacts, subjects)...');
  await db.collection('organizations').doc(orgId).update({
    description: 'Инновационный учебный центр Planula. Мы предлагаем качественное гибридное образование по самым актуальным направлениям: Программирование, Дизайн, Английский язык и Робототехника. Наши студенты добиваются выдающихся результатов благодаря современным методикам и лучшим преподавателям-практикам.\n\nЗапишитесь на пробное занятие и начните свой путь в IT вместе с нами!',
    logo: 'https://api.dicebear.com/7.x/shapes/svg?seed=Planula&backgroundColor=b6e3f4',
    subjects: ['Программирование', 'Веб-разработка', 'Дизайн', 'Английский', 'Математика', 'Мобильная разработка'],
    contactPhone: '+996 555 123 456',
    contactEmail: 'hello@planula.kg',
    socialLinks: {
      instagram: '@planulakg',
      telegram: '@planula_bot',
      whatsapp: '+996555123456',
      website: 'planula.test'
    },
    photos: [
      'https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&q=80&w=800',
      'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&q=80&w=800',
      'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=800',
      'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&q=80&w=800'
    ]
  });

  // 3. Create Branches
  console.log('🏢 Creating branches...');
  
  // Clear existing branches first
  const existingBranches = await db.collection('branches').where('organizationId', '==', orgId).get();
  for (const doc of existingBranches.docs) {
    await doc.ref.delete();
  }

  const branches = [
    {
      name: 'Главный офис',
      address: 'ул. Киевская, 120 (пер. Раззакова)',
      city: 'Бишкек',
      status: 'active',
      phone: '+996 555 123 456',
      contactPerson: '',
      organizationId: orgId,
      createdAt: now(),
      updatedAt: now(),
      location: {
        lat: 42.875508,
        lng: 74.594738
      }
    },
    {
      name: 'Южный филиал (Джал)',
      address: 'мкр. Джал, 29/1',
      city: 'Бишкек',
      status: 'active',
      phone: '+996 700 987 654',
      contactPerson: '',
      organizationId: orgId,
      createdAt: now(),
      updatedAt: now(),
      location: {
        lat: 42.836066,
        lng: 74.577232
      }
    }
  ];

  for (const b of branches) {
    await db.collection('branches').add(b);
  }

  // 4. Create some Courses
  console.log('📚 Creating courses...');
  
  const existingCourses = await db.collection('courses').where('organizationId', '==', orgId).get();
  for (const doc of existingCourses.docs) {
    await doc.ref.delete();
  }

  const courses = [
    {
      title: 'Frontend-разработчик с нуля',
      name: 'Frontend-разработчик с нуля',
      description: 'Освойте профессию фронтенд-разработчика: HTML, CSS, JavaScript, React. Практика на реальных проектах и создание портфолио.',
      organizationId: orgId,
      status: 'published',
      createdAt: now(),
      updatedAt: now()
    },
    {
      title: 'UX/UI Дизайн интерфейсов',
      name: 'UX/UI Дизайн интерфейсов',
      description: 'Изучите основы проектирования интерфейсов в Figma. От идеи до интерактивного прототипа.',
      organizationId: orgId,
      status: 'published',
      createdAt: now(),
      updatedAt: now()
    },
    {
      title: 'Advanced English C1',
      name: 'Advanced English C1',
      description: 'Продвинутый курс английского языка с носителями языка. Фокус на Speaking & Writing.',
      organizationId: orgId,
      status: 'published',
      createdAt: now(),
      updatedAt: now()
    }
  ];

  for (const c of courses) {
    await db.collection('courses').add(c);
  }

  console.log('✅ Planula seeded successfully!');
}

main().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
