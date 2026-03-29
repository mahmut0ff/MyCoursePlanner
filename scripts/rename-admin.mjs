import fs from 'fs';

const replacements = [
  { file: 'src/locales/ru.json', from: /"roleAdmin": "Администратор"/g, to: '"roleAdmin": "Директор"' },
  { file: 'src/locales/ru.json', from: /"admin": "Админ"/g, to: '"admin": "Директор"' },
  { file: 'src/locales/ru.json', from: /"coreRbac": "Роли: Админ, Преподаватель, Ученик"/g, to: '"coreRbac": "Роли: Директор, Преподаватель, Ученик"' },
  
  { file: 'src/locales/kg.json', from: /"roleAdmin": "Администратор"/g, to: '"roleAdmin": "Директор"' },
  { file: 'src/locales/kg.json', from: /"admin": "Админ"/g, to: '"admin": "Директор"' },

  { file: 'src/locales/en.json', from: /"roleAdmin": "Admin"/g, to: '"roleAdmin": "Director"' },
  { file: 'src/locales/en.json', from: /"admin": "Admin"/g, to: '"admin": "Director"' },

  { file: 'src/pages/student/StudentGroupsPage.tsx', from: /Обратитесь к администратору/g, to: 'Обратитесь к директору' },
  { file: 'src/pages/student/StudentCoursesPage.tsx', from: /Обратитесь к администратору/g, to: 'Обратитесь к директору' },
  { file: 'src/pages/dashboard/StudentEnrollmentOnboarding.tsx', from: /обратитесь к администратору/g, to: 'обратитесь к директору' },
  
  { file: 'src/pages/dashboard/SuperAdminDashboard.tsx', from: /t\('admin\.stats\.admins', 'Администраторы'\)/g, to: "t('admin.stats.admins', 'Директора')" },

  { file: 'src/pages/admin/AdminUsersPage.tsx', from: /t\('roles\.admin', 'Администратор'\)/g, to: "t('roles.admin', 'Директор')" },
  
  { file: 'src/components/layout/OrgSwitcher.tsx', from: /t\('membership\.admin', 'Админ'\)/g, to: "t('membership.admin', 'Директор')" }
];

let changedFiles = 0;

replacements.forEach(r => {
  if (fs.existsSync(r.file)) {
    let content = fs.readFileSync(r.file, 'utf8');
    const newContent = content.replace(r.from, r.to);
    if (content !== newContent) {
      fs.writeFileSync(r.file, newContent, 'utf8');
      console.log(`Updated ${r.file}`);
      changedFiles++;
    }
  } else {
    console.warn(`File not found: ${r.file}`);
  }
});

console.log(`Done replacing UI administration names. Changed ${changedFiles} blocks.`);
