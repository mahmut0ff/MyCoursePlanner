import fs from 'fs';
import path from 'path';

const localesDir = path.resolve('src/locales');

const keysToAdd = {
  ru: {
    dashboard: {
      goodMorning: "Доброе утро",
      goodAfternoon: "Добрый день",
      goodEvening: "Добрый вечер",
      subtitle: "Управляйте вашим учебным центром",
      createLesson: "Создать урок",
      branchAnalytics: "Аналитика по филиалам",
      branches: "филиалов",
      students: "Студенты",
      teachers: "Преподаватели",
      courses: "Курсы",
      groups: "Группы",
      exams: "Экзамены",
      participants: "участников",
      recentResults: "Недавние результаты",
      pass: "Сдан",
      fail: "Не сдан",
      noResults: "Пока нет результатов",
      welcome: "Добро пожаловать"
    },
    teacherDashboard: {
      welcome: "Добро пожаловать",
      subtitleOrg: "Ваше рабочее пространство преподавателя",
      subtitleNoOrg: "Вы независимый преподаватель",
      newLesson: "Новый урок",
      newExam: "Новый тест",
      getStarted: "С чего начать?",
      getStartedDesc: "Заполните профиль и найдите работу или начните преподавать независимо",
      fillProfile: "Заполнить профиль",
      browseVacancies: "Обзор вакансий",
      viewInvites: "Приглашения",
      pendingInvites: "У вас {{count}} новых приглашений",
      myLessons: "Мои уроки",
      myExams: "Мои тесты",
      activeRooms: "Активные залы",
      avgScore: "Средний балл",
      recentLessons: "Последние уроки",
      recentExams: "Последние тесты",
      liveRooms: "Live Залы",
      recentResults: "Последние оценки",
      quickLinks: "Быстрые ссылки",
      pass: "Сдан",
      fail: "Не сдан",
      noResults: "Пока нет результатов",
      viewAll: "Смотреть все",
      participants: "участников"
    },
    studentDashboard: {
      subtitle: "Продолжайте покорять новые вершины!",
      heroTitleNoOrg: "Войдите в учебное пространство, чтобы начать свое приключение!",
      findCenterBtn: "Найти учебный центр",
      joinLiveRoom: "Зайти в Зал",
      studentRoomDesc: "Студенческая комната",
      quiz: "Квиз",
      quizDesc: "Введите код игры",
      directory: "Каталог",
      schoolsDesc: "Школы и центры",
      intoWaitingRoom: "В Зал Ожидания",
      liveLessonTitle: "Live Урок",
      liveLessonDesc: "Войти по коду",
      quizTitle: "Викторина",
      quickGameDesc: "Быстрая игра",
      lessonsTitle: "Уроки",
      resultsTitle: "Результаты",
      yourSuccessDesc: "Ваши успехи"
    },
    admin: {
      tabs: {
        overview: "Обзор",
        organizations: "Организации",
        logs: "Системные логи"
      },
      dashboard: {
        title: "Администрирование платформы",
        subtitle: "Управление организациями и настройками платформы"
      },
      stats: {
        organizations: "Организации",
        totalUsers: "Всего пользователей",
        monthlyRevenue: "Доход / мес",
        totalExams: "Всего экзаменов",
        planDistribution: "Распределение тарифов",
        trialOrgs: "Пробный период",
        userBreakdown: "Состав пользователей",
        students: "Студенты",
        teachers: "Преподаватели",
        admins: "Директора",
        totalAttempts: "Всего попыток"
      },
      orgs: {
        organization: "Организация",
        plan: "Тариф",
        users: "Пользователи",
        suspend: "Приостановить",
        reactivate: "Активировать",
        confirmSuspend: "Приостановить эту организацию?",
        empty: "Организаций пока нет"
      },
      logs: {
        empty: "Логов пока нет"
      }
    }
  },
  en: {
    dashboard: {
      goodMorning: "Good morning",
      goodAfternoon: "Good afternoon",
      goodEvening: "Good evening",
      subtitle: "Manage your education center",
      createLesson: "Create lesson",
      branchAnalytics: "Branch Analytics",
      branches: "branches",
      students: "Students",
      teachers: "Teachers",
      courses: "Courses",
      groups: "Groups",
      exams: "Exams",
      participants: "participants",
      recentResults: "Recent Results",
      pass: "Passed",
      fail: "Failed",
      noResults: "No results yet",
      welcome: "Welcome"
    },
    teacherDashboard: {
      welcome: "Welcome",
      subtitleOrg: "Your teacher workspace",
      subtitleNoOrg: "You are an independent teacher",
      newLesson: "New Lesson",
      newExam: "New Exam",
      getStarted: "Getting Started",
      getStartedDesc: "Fill out your profile, find a job or teach independently",
      fillProfile: "Complete Profile",
      browseVacancies: "Browse Vacancies",
      viewInvites: "Invitations",
      pendingInvites: "You have {{count}} pending invitations",
      myLessons: "My Lessons",
      myExams: "My Exams",
      activeRooms: "Active Rooms",
      avgScore: "Average Score",
      recentLessons: "Recent Lessons",
      recentExams: "Recent Exams",
      liveRooms: "Live Rooms",
      recentResults: "Recent Results",
      quickLinks: "Quick Links",
      pass: "Passed",
      fail: "Failed",
      noResults: "No results yet",
      viewAll: "View All",
      participants: "participants"
    },
    studentDashboard: {
      subtitle: "Keep reaching new heights!",
      heroTitleNoOrg: "Enter the workspace to start your learning adventure!",
      findCenterBtn: "Find a Learning Center",
      joinLiveRoom: "Join Room",
      studentRoomDesc: "Student live room",
      quiz: "Quiz",
      quizDesc: "Enter game PIN",
      directory: "Directory",
      schoolsDesc: "Schools & Centers",
      intoWaitingRoom: "Go to Waiting Room",
      liveLessonTitle: "Live Lesson",
      liveLessonDesc: "Enter PIN code",
      quizTitle: "Quiz",
      quickGameDesc: "Quick Game",
      lessonsTitle: "Lessons",
      resultsTitle: "Results",
      yourSuccessDesc: "Your achievements"
    },
    admin: {
      tabs: {
        overview: "Overview",
        organizations: "Organizations",
        logs: "System Logs"
      },
      dashboard: {
        title: "Platform Administration",
        subtitle: "Manage organizations and platform settings"
      },
      stats: {
        organizations: "Organizations",
        totalUsers: "Total Users",
        monthlyRevenue: "Monthly Rev.",
        totalExams: "Total Exams",
        planDistribution: "Plan Distribution",
        trialOrgs: "Trial Period",
        userBreakdown: "User Breakdown",
        students: "Students",
        teachers: "Teachers",
        admins: "Admins",
        totalAttempts: "Total Attempts"
      },
      orgs: {
        organization: "Organization",
        plan: "Plan",
        users: "Users",
        suspend: "Suspend",
        reactivate: "Reactivate",
        confirmSuspend: "Suspend this organization?",
        empty: "No organizations yet"
      },
      logs: {
        empty: "No logs yet"
      }
    }
  },
  kg: {
    dashboard: {
      goodMorning: "Кутман таң",
      goodAfternoon: "Кутман күн",
      goodEvening: "Кутман кеч",
      subtitle: "Окуу борборуңузду башкарыңыз",
      createLesson: "Сабак түзүү",
      branchAnalytics: "Филиалдар боюнча аналитика",
      branches: "филиалдар",
      students: "Студенттер",
      teachers: "Мугалимдер",
      courses: "Курстар",
      groups: "Топтор",
      exams: "Сынактар",
      participants: "катышуучу",
      recentResults: "Акыркы жыйынтыктар",
      pass: "Өттү",
      fail: "Өткөн жок",
      noResults: "Азырынча жыйынтык жок",
      welcome: "Кош келиңиз"
    },
    teacherDashboard: {
      welcome: "Кош келиңиз",
      subtitleOrg: "Сиздин мугалимдик мейкиндигиңиз",
      subtitleNoOrg: "Сиз көз карандысыз мугалимсиз",
      newLesson: "Жаңы сабак",
      newExam: "Жаңы тест",
      getStarted: "Эмнеден башөө керек?",
      getStartedDesc: "Профилди толтуруңуз, жумуш табыңыз же эркин окутуңуз",
      fillProfile: "Профилди толтуруу",
      browseVacancies: "Жумуш орундарын кароо",
      viewInvites: "Чакыруулар",
      pendingInvites: "Сизде {{count}} жаңы чакыруу бар",
      myLessons: "Менин сабактарым",
      myExams: "Менин тесттерим",
      activeRooms: "Активдүү бөлмөлөр",
      avgScore: "Орточо балл",
      recentLessons: "Акыркы сабактар",
      recentExams: "Акыркы тесттер",
      liveRooms: "Live бөлмөлөр",
      recentResults: "Акыркы баалар",
      quickLinks: "Ыкчам шилтемелер",
      pass: "Өттү",
      fail: "Өткөн жок",
      noResults: "Жыйынтык жок",
      viewAll: "Баарын көрүү",
      participants: "катышуучу"
    },
    studentDashboard: {
      subtitle: "Жаңы бийиктиктерди багындыра бериңиз!",
      heroTitleNoOrg: "Окуу мейкиндигине кирип, укмуштуу окуяларды баштаңыз!",
      findCenterBtn: "Окуу борборун издөө",
      joinLiveRoom: "Бөлмөгө кирүү",
      studentRoomDesc: "Студенттик бөлмө",
      quiz: "Квиз",
      quizDesc: "Оюн кодун киргизиңиз",
      directory: "Каталог",
      schoolsDesc: "Мектептер жана борборлор",
      intoWaitingRoom: "Күтүү залына кирүү",
      liveLessonTitle: "Live Сабак",
      liveLessonDesc: "Код боюнча кирүү",
      quizTitle: "Викторина",
      quickGameDesc: "Тез оюн",
      lessonsTitle: "Сабактар",
      resultsTitle: "Жыйынтыктар",
      yourSuccessDesc: "Жетишкендиктериңиз"
    },
    admin: {
      tabs: {
        overview: "Обзор",
        organizations: "Организациялар",
        logs: "Системалык логдор"
      },
      dashboard: {
        title: "Платформаны администрациялоо",
        subtitle: "Организацияларды жана платформаны башкаруу"
      },
      stats: {
        organizations: "Организациялар",
        totalUsers: "Жалпы колдонуучулар",
        monthlyRevenue: "Киреше / ай",
        totalExams: "Жалпы сынактар",
        planDistribution: "Тарифтердин бөлүнүшү",
        trialOrgs: "Сыноо мөөнөтү",
        userBreakdown: "Колдонуучулардын курамы",
        students: "Студенттер",
        teachers: "Мугалимдер",
        admins: "Директорлор",
        totalAttempts: "Жалпы аракеттер"
      },
      orgs: {
        organization: "Организация",
        plan: "Тариф",
        users: "Колдонуучулар",
        suspend: "Токтото туруу",
        reactivate: "Активдештирүү",
        confirmSuspend: "Бул уюмду токтотосуңбу?",
        empty: "Организациялар азырынча жок"
      },
      logs: {
        empty: "Логдор азырынча жок"
      }
    }
  }
};

async function updateLocales() {
  for (const [lang, translations] of Object.entries(keysToAdd)) {
    const filePath = path.join(localesDir, `${lang}.json`);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const json = JSON.parse(content);
      
      json.dashboard = { ...(json.dashboard || {}), ...translations.dashboard };
      json.teacherDashboard = { ...(json.teacherDashboard || {}), ...translations.teacherDashboard };
      json.studentDashboard = { ...(json.studentDashboard || {}), ...translations.studentDashboard };
      json.admin = { ...(json.admin || {}), ...translations.admin };
      
      fs.writeFileSync(filePath, JSON.stringify(json, null, 2), 'utf-8');
      console.log(`Updated ${lang}.json`);
    } else {
      console.log(`Warning: ${filePath} not found.`);
    }
  }
}

updateLocales();
