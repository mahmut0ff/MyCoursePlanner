const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/pages/landing/LandingPage.tsx');
let file = fs.readFileSync(filePath, 'utf8');

// 1. Remove all dark: classes to force light mode
file = file.replace(/dark:[^\s"'>}]+/g, '');

// 2. Clean up double spaces
file = file.replace(/ +/g, ' ');

// 3. Update Logo and Name in Navbar
file = file.replace(
  /<div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-500 to-violet-500 flex items-center justify-center">\s*<GraduationCap className="w-4\.5 h-4\.5 text-white" \/>\s*<\/div>\s*<span className="font-bold text-lg">MyCoursePlan<\/span>/g,
  '<img src="/icons/logo.png" alt="Planula" className="h-8 w-auto object-contain" />\n<span className="font-bold text-xl tracking-tight">Planula</span>'
);

// 4. Update Footer Brand
file = file.replace(
  /<div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-500 to-violet-500 flex items-center justify-center">\s*<GraduationCap className="w-4\.5 h-4\.5 text-white" \/>\s*<\/div>\s*<span className="font-bold text-lg">MyCoursePlan<\/span>/g,
  '<img src="/icons/logo.png" alt="Planula" className="h-8 w-auto object-contain" />\n<span className="font-bold text-xl tracking-tight">Planula</span>'
);

// 5. Replace other MyCoursePlan references with Planula
file = file.replace(/MyCoursePlan/g, 'Planula');
file = file.replace(/mycoursePlan/g, 'planula');

// 6. Remove Dashboard Mockup Component definition
file = file.replace(/\/\* ──────────────────────────────────────────\n HERO DASHBOARD MOCKUP \(CSS-based\)\n ────────────────────────────────────────── \*\/(.|\n)*?\/\* ──────────────────────────────────────────\n MAIN LANDING PAGE/g, '/* ──────────────────────────────────────────\n MAIN LANDING PAGE');

// 7. Remove Dashboard Mockup tags
file = file.replace(/<DashboardMockup \/>/g, '');

// 8. Remove Fake Stats Section
file = file.replace(/\{\/\* ═══ Stats ═══ \*\/\}\s*<section className=\"py-12 px-6\">\s*<div className=\"max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6\">\s*\{stats\.map\(\(s\) => \(\s*<div key=\{s\.label\} className=\"text-center p-6 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow\">\s*<p className=\"text-3xl font-extrabold bg-gradient-to-r from-primary-600 to-violet-600 bg-clip-text text-transparent\">\{s\.value\}<\/p>\s*<p className=\"text-sm text-slate-500 mt-1\">\{s\.label\}<\/p>\s*<\/div>\s*\)\)\}\s*<\/div>\s*<\/section>/g, '');

// 8b. Ensure clean removal between Hero and Features
file = file.replace(/\{\/\* ═══ Stats ═══ \*\/\}[\s\S]*?\{\/\* ═══ Features Grid ═══ \*\/\}/, '{/* ═══ Features Grid ═══ */}');

// Write back
fs.writeFileSync(filePath, file);
console.log('Fixed landing page');
