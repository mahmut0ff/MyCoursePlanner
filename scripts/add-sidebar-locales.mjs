import fs from 'fs';
import path from 'path';

const localesDir = path.resolve('src/locales');

const keysToAdd = {
  ru: {
    nav: {
      homeworkReview: "Проверка ДЗ",
      riskDashboard: "Светофор рисков"
    },
    common: {
      howItWorks: "Как работает модуль?"
    }
  },
  en: {
    nav: {
      homeworkReview: "Homework Review",
      riskDashboard: "Risk Dashboard"
    },
    common: {
      howItWorks: "How it works?"
    }
  },
  kg: {
    nav: {
      homeworkReview: "Үй тапшырма текшерүү",
      riskDashboard: "Тобокелдиктер светофору"
    },
    common: {
      howItWorks: "Бул кантип иштейт?"
    }
  }
};

async function updateLocales() {
  for (const [lang, translations] of Object.entries(keysToAdd)) {
    const filePath = path.join(localesDir, `${lang}.json`);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const json = JSON.parse(content);
      
      // Inject nav items
      if (!json.nav) json.nav = {};
      json.nav.homeworkReview = translations.nav.homeworkReview;
      json.nav.riskDashboard = translations.nav.riskDashboard;
      
      // Inject common items
      if (!json.common) json.common = {};
      json.common.howItWorks = translations.common.howItWorks;

      fs.writeFileSync(filePath, JSON.stringify(json, null, 2), 'utf-8');
      console.log(`Updated ${lang}.json`);
    } else {
      console.log(`Warning: ${filePath} not found.`);
    }
  }
}

updateLocales();
