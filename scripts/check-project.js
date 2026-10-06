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
  'src/events/guildMemberAdd.js',
  'src/events/guildMemberRemove.js',
  'src/commands/general/ping.js',
  'src/commands/general/status.js',
  'src/commands/general/news.js',
  'src/commands/general/nachricht.js',
  'src/commands/setup/verify.js',
  'src/features/verify.js',
  'src/features/welcome.js',
  'src/features/embeds.js',
  'src/utils/guildSettings.js'
];

let failed = false;
for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(process.cwd(), file))) {
    console.error('Fehlt: ' + file);
    failed = true;
  }
}
if (fs.existsSync(path.join(process.cwd(), '.env'))) {
  console.warn('Hinweis: .env existiert lokal. Das ist okay, solange sie nicht in GitHub landet.');
}
if (failed) process.exit(1);
console.log('Novora Projektcheck erfolgreich.');
