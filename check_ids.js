const fs = require('fs');
const appJs = fs.readFileSync('C:/Users/HP/.gemini/antigravity/scratch/chatibb/app.js', 'utf8');
const indexHtml = fs.readFileSync('C:/Users/HP/.gemini/antigravity/scratch/chatibb/index.html', 'utf8');

// Match all document.getElementById('...')
const idRegex = /document\.getElementById\(['"]([^'"]+)['"]\)/g;
let match;
const ids = new Set();
while ((match = idRegex.exec(appJs)) !== null) {
  ids.add(match[1]);
}

console.log("Checking IDs from app.js in index.html:");
let missingCount = 0;
for (let id of ids) {
  if (!indexHtml.includes(`id="${id}"`) && !indexHtml.includes(`id='${id}'`)) {
    console.log(`❌ Missing ID in HTML: ${id}`);
    missingCount++;
  }
}
if (missingCount === 0) {
  console.log("✓ All IDs found in index.html!");
}
