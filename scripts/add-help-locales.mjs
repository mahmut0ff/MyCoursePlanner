import fs from 'fs';
import path from 'path';

const localesDir = path.resolve('src/locales');

const locales = {
  ru: {
    dashboard: {
      title: "Дашборд",
      desc: "Главная панель управления. Здесь собрана сводка по вашей активности, ближайшие события и ключевые метрики.",
      f1: "Быстрый доступ к последним активностям",
      f2: "Общая статистика и вовлеченность",
      f3: "Список предстоящих расписаний",
      t1: "Нажимайте на виджеты, чтобы быстро переходить к нужным модулям.",
      t2: "Дашборд адаптируется под вашу роль: администраторы видят финансы организации, а преподаватели — свои группы."
    },
    lessons: {
      title: "Уроки",
      desc: "Модуль для создания интерактивных образовательных лонгридов. Вы можете добавлять текст, видео, формулы и прикреплять файлы.",
      f1: "Блочный редактор (как в Notion)",
      f2: "Прикрепление любых материалов",
      f3: "Доступ можно настроить для отдельных групп",
      t1: "Используйте \"/\" (слэш) в редакторе, чтобы быстро вызвать меню блоков.",
      t2: "Нажмите \"Сгенерировать ИИ\", чтобы нейросеть создала каркас урока за вас по заданной теме."
    },
    materials: {
      title: "Материалы",
      desc: "Единая библиотека файлов. Загружайте PDF, презентации, видео и аудио, чтобы прикреплять их к урокам или выдавать студентам напрямую.",
      f1: "Структурированное хранение файлов",
      f2: "Быстрый шеринг со студентами",
      t1: "Студенты видят только те файлы, доступ к которым вы явно открыли (или прикрепили к уроку)."
    },
    exams: {
      title: "Экзамены (База тестов)",
      desc: "Здесь вы создаете структуру тестов и экзаменов, пишете вопросы и настраиваете правильные ответы.",
      f1: "Множественный и одиночный выбор",
      f2: "Вопросы с открытым ответом",
      f3: "Автоматический подсчет баллов",
      t1: "Сам по себе экзамен — это просто шаблон. Чтобы студенты начали его сдавать, вам нужно создать \"Экзаменационную комнату\" и выбрать в ней этот экзамен."
    },
    rooms: {
      title: "Экзаменационные комнаты",
      desc: "Живые сессии для сдачи экзаменов. Создаете комнату, назначаете время, скидываете ссылку или PIN-код студентам — и контролируете процесс в реальном времени.",
      f1: "Мониторинг прогресса студентов в реальном времени",
      f2: "Ограничение по времени (таймер)",
      f3: "Принудительное завершение попыток",
      t1: "Поделитесь ссылкой на комнату или скажите студентам ввести PIN-код на экране \"Присоединиться\".",
      t2: "Вы можете вживую видеть, кто на каком вопросе находится."
    },
    quiz_library: {
      title: "Библиотека Квизов",
      desc: "Создание ярких, геймифицированных интерактивных игр (в стиле Kahoot или Quizizz). Подходит для разогрева на уроке или быстрого среза знаний.",
      f1: "Создание слайдов и вопросов на скорость",
      f2: "Импорт картинок и гифок",
      t1: "Запускайте квиз на проекторе, а студенты пусть отвечают с телефонов."
    },
    quiz_sessions: {
      title: "История и Игры Квизов",
      desc: "Запуск квизов и история проведенных игр с подробной аналитикой по каждому игроку и вопросу.",
      f1: "Отчеты по прошлым играм",
      f2: "Выявление самых сложных вопросов"
    },
    journal: {
      title: "Журнал",
      desc: "Реестр оценок и посещаемости. Ведите учет успеваемости студентов по датам.",
      f1: "Отметки Присутствовал / Отсутствовал",
      f2: "Выставление оценок за активности",
      t1: "Студенты не видят журнал группы, они видят только свои оценки в личном кабинете."
    },
    gradebook: {
      title: "Оценки (Итоговые)",
      desc: "Сводные матрицы оценок по всем группам. Удобно для подведения итогов четверти, семестра или года.",
      f1: "Экспорт в Excel",
      f2: "Сводка по группе на одном экране"
    },
    groups: {
      title: "Группы студентов",
      desc: "Объединение студентов в классы или группы. Группе можно разом назначить курс, экзамен или урок.",
      f1: "Массовое управление доступом",
      f2: "Просмотр расписания группы"
    },
    courses: {
      title: "Курсы (Программы)",
      desc: "Крупные образовательные программы, объединяющие в себе модули уроков, экзамены и материалы.",
      f1: "Построение учебного плана",
      f2: "Выдача сертификатов по завершении",
      t1: "Создайте курс и добавьте туда уроки, чтобы студентам было легче ориентироваться в структуре обучения."
    },
    finances: {
      title: "Финансы (CRM)",
      desc: "Учет оплат, долгов и подписок студентов.",
      f1: "Контроль задолженностей",
      f2: "История платежей",
      t1: "Платформа не списывает деньги автоматически, этот модуль работает как учетная книга (CRM) для вашего администратора."
    },
    schedule: {
      title: "Расписание",
      desc: "Планирование занятий, лекций и экзаменов. Отображается в виде календаря.",
      f1: "Еженедельное расписание",
      f2: "Уведомления о переносах",
      t1: "Назначьте занятие группе, и оно автоматически появится в календарях всех студентов этой группы."
    },
    teacher_analytics: {
      title: "Продвинутая аналитика",
      desc: "Дашборд директора/завуча. Детальный разбор эффективности преподавателей и вовлеченности студентов.",
      f1: "Графики оплат и роста",
      f2: "Тренды успеваемости"
    },
    risk_dashboard: {
      title: "Светофор Рисков",
      desc: "ИИ-модуль предсказания оттока. Система автоматически помечает красным студентов, которые стали хуже учиться или пропускать.",
      f1: "Раннее выявление проблем",
      f2: "Рекомендации по удержанию",
      t1: "Обратите внимание на \"красную\" зону — свяжитесь с этими студентами или их родителями как можно скорее."
    },
    org_settings: {
      title: "Настройки организации",
      desc: "Глобальные параметры: имя, логотип, тарифные планы, интеграции (Telegram, ИИ) и публичный профиль.",
      f1: "Создание публичной визитки",
      f2: "Управление доступом",
      t1: "Заполните публичный профиль, чтобы ваша организация отображалась в общем Каталоге платформы."
    }
  },
  en: {
    dashboard: {
      title: "Dashboard",
      desc: "Main control panel. Here is a summary of your activity, upcoming events, and key metrics.",
      f1: "Quick access to latest activities",
      f2: "Overall statistics and engagement",
      f3: "List of upcoming schedules",
      t1: "Click on widgets to quickly jump to the desired modules.",
      t2: "The dashboard adapts to your role: administrators see organization finances, while teachers see their groups."
    },
    lessons: {
      title: "Lessons",
      desc: "Module for creating interactive educational longreads. You can add text, video, formulas, and attach files.",
      f1: "Block editor (like Notion)",
      f2: "Attach any materials",
      f3: "Access can be configured for specific groups",
      t1: "Use \"/\" (slash) in the editor to quickly open the blocks menu.",
      t2: "Click \"AI Generate\" to let the neural network create a lesson outline for you based on a topic."
    },
    materials: {
      title: "Materials",
      desc: "Unified file library. Upload PDFs, presentations, videos, and audios to attach them to lessons or assign to students directly.",
      f1: "Structured file storage",
      f2: "Quick sharing with students",
      t1: "Students only see files you explicitly granted access to (or attached to a lesson)."
    },
    exams: {
      title: "Exams (Test Bank)",
      desc: "Here you create the structure of tests and exams, write questions, and configure correct answers.",
      f1: "Multiple and single choice",
      f2: "Open-ended questions",
      f3: "Automatic scoring",
      t1: "The exam itself is just a template. For students to start taking it, you need to create an \"Exam Room\" and select this exam in it."
    },
    rooms: {
      title: "Exam Rooms",
      desc: "Live sessions for taking exams. You create a room, set a time, share a link or PIN code with students — and control the process in real-time.",
      f1: "Real-time monitoring of student progress",
      f2: "Time limit (timer)",
      f3: "Forced termination of attempts",
      t1: "Share the room link or tell students to enter the PIN code on the \"Join\" screen.",
      t2: "You can live-track who is on which question."
    },
    quiz_library: {
      title: "Quiz Library",
      desc: "Create vibrant, gamified interactive games (Kahoot or Quizizz style). Suitable for a warm-up in class or a quick knowledge check.",
      f1: "Create speed slides and questions",
      f2: "Import images and GIFs",
      t1: "Run the quiz on a projector, and let students answer from their phones."
    },
    quiz_sessions: {
      title: "Quiz History & Games",
      desc: "Launch quizzes and view the history of past games with detailed analytics for each player and question.",
      f1: "Reports on past games",
      f2: "Identify the most difficult questions"
    },
    journal: {
      title: "Journal",
      desc: "Gradebook and attendance registry. Track student academic performance by dates.",
      f1: "Present / Absent marks",
      f2: "Assign grades for activities",
      t1: "Students do not see the group journal, they only see their own grades in their personal cabinet."
    },
    gradebook: {
      title: "Grades (Final)",
      desc: "Consolidated grade matrices across all groups. Useful for wrapping up a quarter, semester, or year.",
      f1: "Export to Excel",
      f2: "Group summary on one screen"
    },
    groups: {
      title: "Student Groups",
      desc: "Organizing students into classes or groups. A group can be assigned a course, exam, or lesson all at once.",
      f1: "Bulk access management",
      f2: "View group schedule"
    },
    courses: {
      title: "Courses (Programs)",
      desc: "Large educational programs uniting lesson modules, exams, and materials.",
      f1: "Building a curriculum",
      f2: "Issuing certificates upon completion",
      t1: "Create a course and add lessons to it so students can easily navigate the learning structure."
    },
    finances: {
      title: "Finances (CRM)",
      desc: "Tracking payments, debts, and student subscriptions.",
      f1: "Debt control",
      f2: "Payment history",
      t1: "The platform does not deduct money automatically; this module acts as an accounting book (CRM) for your admin."
    },
    schedule: {
      title: "Schedule",
      desc: "Planning classes, lectures, and exams. Displayed as a calendar.",
      f1: "Weekly schedule",
      f2: "Rescheduling notifications",
      t1: "Assign a class to a group, and it will automatically appear in the calendars of all students in that group."
    },
    teacher_analytics: {
      title: "Advanced Analytics",
      desc: "Principal/Headteacher dashboard. Detailed breakdown of teacher effectiveness and student engagement.",
      f1: "Revenue and growth charts",
      f2: "Performance trends"
    },
    risk_dashboard: {
      title: "Risk Traffic Light",
      desc: "AI churn prediction module. The system automatically highlights students in red who have started studying poorly or skipping.",
      f1: "Early detection of problems",
      f2: "Retention recommendations",
      t1: "Pay attention to the \"red\" zone — contact these students or their parents as soon as possible."
    },
    org_settings: {
      title: "Organization Settings",
      desc: "Global parameters: name, logo, pricing plans, integrations (Telegram, AI), and public profile.",
      f1: "Create a public business card",
      f2: "Access management",
      t1: "Fill out the public profile so your organization appears in the platform's global Directory."
    }
  },
  kg: {
    dashboard: {
      title: "Башкаруу панели",
      desc: "Сиздин активдүүлүгүңүз, алдыдагы окуялар жана негизги көрсөткүчтөр боюнча кыскача маалымат.",
      f1: "Акыркы аракеттерге тез жетүү",
      f2: "Жалпы статистика жана катышуу",
      f3: "Алдыдагы расписаниелердин тизмеси",
      t1: "Тиешелүү модулдар үчүн виджеттерди басыңыз.",
      t2: "Панель ролуңузга ылайыкташат."
    },
    lessons: {
      title: "Сабактар",
      desc: "Интерактивдүү билим берүү материалдарын түзүү модулу. Текст, видео, формула кошуп, файлдарды тиркей аласыз.",
      f1: "Блоктук редактор",
      f2: "Файлдарды тиркөө",
      f3: "Берилген топтор үчүн жеткиликтүүлүктү жөндөө",
      t1: "/",
      t2: "Жасалма интеллекттин жардамы менен сабакты түзүңүз."
    },
    materials: {
      title: "Материалдар",
      desc: "Файлдардын бирдиктүү китепканасы. Окуучуларга берүү үчүн PDF, тааныштыруу, видео жана аудио жүктөңүз.",
      f1: "Файлдарды түзүмдүү сактоо",
      f2: "Окуучулар менен бөлүшүү",
      t1: "Студенттер уруксат берилген файлдарды гана көрүшөт."
    },
    exams: {
      title: "Сынактар",
      desc: "Бул жерде тест жана сынак структураларын түзүп, суроолорду жазасыз.",
      f1: "Көп же жалгыз тандоо",
      f2: "Ачык жооптуу суроолор",
      f3: "Баллдарды автоматтык эсептөө",
      t1: "Сынакты баштоо үчүн бөлмө түзүү керек."
    },
    rooms: {
      title: "Сынак бөлмөлөрү",
      desc: "Сынак тапшыруу үчүн реалдуу убакыт бөлмөлөрү.",
      f1: "Прогрессти реалдуу убакытта көзөмөлдөө",
      f2: "Убакыт чектөө (таймер)",
      f3: "Сынакты мажбурлап бүтүрүү",
      t1: "Студенттерге бөлмөгө кирүү үчүн шилтеме же PIN-код бериңиз.",
      t2: "Студент кайсы суроодо экенин түз көрө аласыз."
    },
    quiz_library: {
      title: "Квиз китепканасы",
      desc: "Kahoot стилиндеги интерактивдүү оюндарды түзүңүз.",
      f1: "Ылдамдык суроолорун түзүү",
      f2: "Сүрөт жана GIF жүктөө",
      t1: "Проекторго чыгарып, студенттер телефондон жооп беришет."
    },
    quiz_sessions: {
      title: "Квиз тарыхы",
      desc: "Өткөрүлгөн оюндардын тарыхы жана аналитикасы.",
      f1: "Мурунку оюндардын отчету",
      f2: "Эң кыйын суроолорду аныктоо"
    },
    journal: {
      title: "Журнал",
      desc: "Баалар жана катышуу реестри.",
      f1: "Бар/Жок белгилөө",
      f2: "Активдүүлүк үчүн баа коюу",
      t1: "Студенттер өздөрүнүн гана бааларын көрүшөт."
    },
    gradebook: {
      title: "Баалар (Жыйынтык)",
      desc: "Бардык топтор боюнча жалпы баалар матрицасы.",
      f1: "Excel форматына жүктөө",
      f2: "Бир экранда группа боюнча жыйынтык"
    },
    groups: {
      title: "Топтор",
      desc: "Студенттерди класстарга же топторго бөлүү.",
      f1: "Жапырт жеткиликтүүлүктү башкаруу",
      f2: "Топтун расписаниесин көрүү"
    },
    courses: {
      title: "Курстар",
      desc: "Сабактарды жана сынактарды бириктирген окуу программалары.",
      f1: "Окуу планын түзүү",
      f2: "Сертификат берүү",
      t1: "Курс түзүп, ага сабактарды кошуңуз."
    },
    finances: {
      title: "Каржы (CRM)",
      desc: "Төлөмдөрдү жана карыздарды эсепке алуу.",
      f1: "Карыздарды көзөмөлдөө",
      f2: "Төлөм тарыхы",
      t1: "Бул модуль эсепке алуу китеби катары иштейт."
    },
    schedule: {
      title: "Расписание",
      desc: "Сабактарды жана лекцияларды пландаштыруу.",
      f1: "Апталык расписание",
      f2: "Жылдыруу эскертмелери",
      t1: "Расписание топтун бардык студенттерине көрүнөт."
    },
    teacher_analytics: {
      title: "Аналитика",
      desc: "Директор дашборду. Окутуучулардын эффективдүүлүгү.",
      f1: "Төлөмдөр жана өсүү графикасы",
      f2: "Окуу тренддери"
    },
    risk_dashboard: {
      title: "Тобокелдиктер светофору",
      desc: "Жаман окуган студенттерди алдын ала аныктоо.",
      f1: "Көйгөйлөрдү эрте аныктоо",
      f2: "Алып калуу рекомендациялары",
      t1: "Кызыл зонадагы студенттерге көңүл буруңуз."
    },
    org_settings: {
      title: "Организация жөндөөлөрү",
      desc: "Глобалдык параметрлер: аты, лого, тарифтер жана интеграция.",
      f1: "Ачык профиль түзүү",
      f2: "Жеткиликтүүлүктү башкаруу",
      t1: "Профилиңизди толтуруңуз."
    }
  }
};

async function updateLocales() {
  for (const [lang, translations] of Object.entries(locales)) {
    const filePath = path.join(localesDir, `${lang}.json`);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const json = JSON.parse(content);
      json.pageHelp = translations;
      fs.writeFileSync(filePath, JSON.stringify(json, null, 2), 'utf-8');
      console.log(`Updated ${lang}.json`);
    } else {
      console.log(`Warning: ${filePath} not found.`);
    }
  }
}

updateLocales();
