const fs = require('fs');

// 1. Patch LandingPage.tsx
let lp = fs.readFileSync('src/pages/landing/LandingPage.tsx', 'utf8');
lp = lp.replace(/https:\/\/t\.me\/planula"/g, 'https://t.me/planula_bot"');
lp = lp.replace(/mailto:info@planula\.io/g, 'mailto:support@planula.com');
lp = lp.replace(/info@planula\.io/g, 'support@planula.com');
lp = lp.replace(/\+996 555 000 000/g, '+996 550 308 078');
fs.writeFileSync('src/pages/landing/LandingPage.tsx', lp);
console.log('Patched LandingPage.tsx');

// 2. Patch en.json
let en = fs.readFileSync('src/locales/en.json', 'utf8');
en = en.replace(/"footerCity":\s*"[^"]+"/, '"footerCity": "Osh, Kyrgyzstan"');
fs.writeFileSync('src/locales/en.json', en);
console.log('Patched en.json');

// 3. Patch ru.json
let ru = fs.readFileSync('src/locales/ru.json', 'utf8');
ru = ru.replace(/"footerCity":\s*"[^"]+"/, '"footerCity": "г. Ош, Кыргызстан"');
fs.writeFileSync('src/locales/ru.json', ru);
console.log('Patched ru.json');
