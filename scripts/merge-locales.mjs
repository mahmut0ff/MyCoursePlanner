import fs from 'fs';
import path from 'path';

const landingLocales = 'c:\\Users\\ZOICHI\\Desktop\\MyCoursePlan\\landing\\src\\locales';
const appLocales = 'c:\\Users\\ZOICHI\\Desktop\\MyCoursePlan\\src\\locales';

const files = ['en.json', 'ru.json', 'kg.json'];

function deepMerge(target, source) {
    for (const key of Object.keys(source)) {
        if (source[key] instanceof Object && !Array.isArray(source[key]) && key in target) {
            Object.assign(source[key], deepMerge(target[key], source[key]));
        }
    }
    Object.assign(target || {}, source);
    return target;
}

files.forEach(file => {
    const landingPath = path.join(landingLocales, file);
    const appPath = path.join(appLocales, file);

    if (fs.existsSync(landingPath) && fs.existsSync(appPath)) {
        const landingData = JSON.parse(fs.readFileSync(landingPath, 'utf8'));
        const appData = JSON.parse(fs.readFileSync(appPath, 'utf8'));
        
        // Merge landing into app (landing takes precedence if same keys, but mostly they are diff) 
        const merged = deepMerge(appData, landingData);

        fs.writeFileSync(appPath, JSON.stringify(merged, null, 2), 'utf8');
        console.log(`Merged ${file} successfully.`);
    } else {
        console.log(`Skipped ${file} as it doesn't exist in both places.`);
    }
});
