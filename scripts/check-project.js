const fs = require('node:fs');
const path = require('node:path');

const requiredFiles = [
  'index.js',
  'package.json',
  '.env.example',
  'src/loaders/commands.js',
  'src/loaders/events.js',
  'src/events/ready.js',
  'src/events/interactionCreate.js',
  'src/commands/general/ping.js',
  'src/commands/general/status.js'
];

let failed = false;

for (const file of requiredFiles) {
  const fullPath = path.join(process.cwd(), file);

  if (!fs.existsSync(fullPath)) {
    console.error(`Fehlt: ${file}`);
    failed = true;
  }
}

if (fs.existsSync(path.join(process.cwd(), '.env'))) {
  console.warn('Hinweis: .env existiert lokal. Das ist okay, solange sie nicht in GitHub landet.');
}

if (failed) {
  process.exit(1);
}

console.log('Novora Projektcheck erfolgreich.');
