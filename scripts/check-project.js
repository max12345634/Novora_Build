const fs = require('node:fs');
const path = require('node:path');
const { collectCommandFiles } = require('../src/loaders/commands');

const requiredFiles = [
  'index.js', 'package.json', '.env.example',
  'src/loaders/commands.js', 'src/loaders/events.js',
  'src/events/ready.js', 'src/events/interactionCreate.js',
  'src/events/guildMemberAdd.js', 'src/events/guildMemberRemove.js',
  'src/events/messageDelete.js', 'src/events/messageUpdate.js',
  'src/events/voiceStateUpdate.js', 'src/events/guildMemberUpdate.js',
  'src/events/guildBanAdd.js', 'src/events/guildBanRemove.js',
  'src/events/channelCreate.js', 'src/events/channelDelete.js', 'src/events/channelUpdate.js',
  'src/events/roleCreate.js', 'src/events/roleDelete.js', 'src/events/roleUpdate.js',
  'src/commands/general/ping.js', 'src/commands/general/status.js',
  'src/commands/general/news.js', 'src/commands/general/nachricht.js',
  'src/commands/setup/verify.js', 'src/features/verify.js',
  'src/features/welcome.js', 'src/features/embeds.js', 'src/features/orders.js',
  'src/utils/auditLog.js', 'src/utils/guildSettings.js'
];

async function main() {
  let failed = false;
  for (const file of requiredFiles) {
    if (!fs.existsSync(path.join(process.cwd(), file))) {
      console.error('Fehlt: ' + file);
      failed = true;
    }
  }
  if (failed) process.exit(1);

  const names = new Set();
  for (const file of await collectCommandFiles(path.join(process.cwd(), 'src', 'commands'))) {
    const command = require(file);
    const payload = command.data?.toJSON();
    if (!payload || typeof command.execute !== 'function') throw new Error('Ungueltiger Command: ' + file);
    if (names.has(payload.name)) throw new Error('Doppelter Command: ' + payload.name);
    names.add(payload.name);
  }
  if (fs.existsSync(path.join(process.cwd(), '.env'))) {
    console.warn('Hinweis: .env existiert lokal. Das ist okay, solange sie nicht in GitHub landet.');
  }
  console.log('Novora Projektcheck erfolgreich. ' + names.size + ' Slash Commands sind gueltig.');
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
