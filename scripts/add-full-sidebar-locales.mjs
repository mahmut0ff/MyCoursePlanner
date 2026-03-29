import fs from 'fs';
import path from 'path';

const localesDir = path.resolve('src/locales');

const keysToAdd = {
  ru: {
    nav: {
      sectionManagement: "Управление",
      sectionSystem: "Система",
      sectionEducation: "Обучение",
      journal: "Журнал",
      gradebook: "Оценки",
      sectionQuiz: "Квизы",
      sectionPeople: "Люди",
      sectionOrg: "Организация",
      finances: "Финансы",
      notifications: "Уведомления",
      sectionPersonalWorkspace: "Личное пространство",
      myLessons: "Мои уроки",
      myMaterials: "Мои материалы",
      myExams: "Мои экзамены",
      myExamRooms: "Экзаменационные комнаты",
      progress: "Мой прогресс",
      diary: "Мой дневник",
      myCourses: "Мои курсы",
      myGroups: "Мои группы",
      myTeachers: "Мои преподаватели",
      sectionExams: "Экзамены и тесты",
      certificates: "Сертификаты",
      achievements: "Достижения"
    }
  },
  en: {
    nav: {
      sectionManagement: "Management",
      sectionSystem: "System",
      sectionEducation: "Education",
      journal: "Journal",
      gradebook: "Gradebook",
      sectionQuiz: "Quizzes",
      sectionPeople: "People",
      sectionOrg: "Organization",
      finances: "Finances",
      notifications: "Notifications",
      sectionPersonalWorkspace: "Personal Workspace",
      myLessons: "My Lessons",
      myMaterials: "My Materials",
      myExams: "My Exams",
      myExamRooms: "Exam Rooms",
      progress: "My Progress",
      diary: "My Diary",
      myCourses: "My Courses",
      myGroups: "My Groups",
      myTeachers: "My Teachers",
      sectionExams: "Exams & Tests",
      certificates: "Certificates",
      achievements: "Achievements"
    }
  },
  kg: {
    nav: {
      sectionManagement: "Башкаруу",
      sectionSystem: "Система",
      sectionEducation: "Окутуу",
      journal: "Журнал",
      gradebook: "Баалар",
      sectionQuiz: "Квиздер",
      sectionPeople: "Адамдар",
      sectionOrg: "Организация",
      finances: "Каржы",
      notifications: "Билдирмелер",
      sectionPersonalWorkspace: "Жеке мейкиндик",
      myLessons: "Менин сабактарым",
      myMaterials: "Менин материалдарым",
      myExams: "Менин сынактарым",
      myExamRooms: "Сынак бөлмөлөрү",
      progress: "Менин прогрессим",
      diary: "Менин күндөлүгүм",
      myCourses: "Менин курстарым",
      myGroups: "Менин топторум",
      myTeachers: "Менин мугалимдерим",
      sectionExams: "Сынактар жана тесттер",
      certificates: "Сертификаттар",
      achievements: "Жетишкендиктер"
    }
  }
};

async function updateLocales() {
  for (const [lang, translations] of Object.entries(keysToAdd)) {
    const filePath = path.join(localesDir, `${lang}.json`);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const json = JSON.parse(content);
      
      if (!json.nav) json.nav = {};
      
      // Merge all nav keys
      for (const [key, value] of Object.entries(translations.nav)) {
        json.nav[key] = value;
      }
      
      fs.writeFileSync(filePath, JSON.stringify(json, null, 2), 'utf-8');
      console.log(`Updated ${lang}.json`);
    } else {
      console.log(`Warning: ${filePath} not found.`);
    }
  }
}

updateLocales();
