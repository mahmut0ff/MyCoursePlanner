const fs = require('fs');
const path = require('path');

const funcsDir = path.join(process.cwd(), 'netlify', 'functions');
if(!fs.existsSync(funcsDir)) return;

const results = {};

fs.readdirSync(funcsDir).filter(f => f.endsWith('.ts')).forEach(f => {
  const pth = path.join(funcsDir, f);
  const content = fs.readFileSync(pth, 'utf8');
  
  // App routing methods: app.get('/...', app.post('/...'
  const endpoints = [...content.matchAll(/app\.(get|post|put|delete|patch)\(['"]([^'"]+)['"]/g)]
    .map(m => m[1].toUpperCase() + ' ' + m[2]);
    
  // db.collection(...) or admin.firestore().collection(...)
  const dbCalls = [...content.matchAll(/(?:db|admin\.firestore\(\))\.(collection|doc)\(['"]([^'"]+)['"]/g)]
    .map(m => m[1] + ' ' + m[2]);

  results[f] = {
    endpoints,
    dbCalls: [...new Set(dbCalls)]
  };
});

fs.writeFileSync('functions-deps.json', JSON.stringify(results, null, 2));
console.log('Functions dependencies extracted');
