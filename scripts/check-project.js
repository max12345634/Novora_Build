const fs = require('node:fs');
const path = require('node:path');
const { GatewayIntentBits } = require('discord.js');
const { collectCommandFiles } = require('../src/loaders/commands');
const { createCaptchaImage } = require('../src/features/verify');
const { makeForm } = require('../src/features/orders');

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
  for (const file of requiredFiles) {
    if (!fs.existsSync(path.join(process.cwd(), file))) {
      throw new Error('Fehlt: ' + file);
    }
  }

  if (!Number.isInteger(GatewayIntentBits.GuildModeration)) {
    throw new Error('GuildModeration Intent fehlt in der installierten discord.js-Version.');
  }

  const commandNames = new Set();
  for (const file of await collectCommandFiles(path.join(process.cwd(), 'src', 'commands'))) {
    const command = require(file);
    const payload = command.data?.toJSON();
    if (!payload || typeof command.execute !== 'function') throw new Error('Ungueltiger Command: ' + file);
    if (commandNames.has(payload.name)) throw new Error('Doppelter Command: ' + payload.name);
    commandNames.add(payload.name);
  }

  const eventRoot = path.join(process.cwd(), 'src', 'events');
  const eventFiles = fs.readdirSync(eventRoot).filter((file) => file.endsWith('.js'));
  for (const file of eventFiles) {
    const event = require(path.join(eventRoot, file));
    if (!event.name || typeof event.execute !== 'function') throw new Error('Ungueltiges Event: ' + file);
  }

  const captcha = createCaptchaImage('234 567').attachment;
  if (!Buffer.isBuffer(captcha) || !captcha.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error('Captcha-Bild ist kein gueltiges PNG.');
  }

  const form = makeForm().toJSON();
  if (form.components.length !== 5) throw new Error('Das Bestellformular muss genau fuenf Fragen enthalten.');

  if (fs.existsSync(path.join(process.cwd(), '.env'))) {
    console.warn('Hinweis: .env existiert lokal. Das ist okay, solange sie nicht in GitHub landet.');
  }
  console.log('Novora Projektcheck erfolgreich: ' + commandNames.size + ' Befehle und ' + eventFiles.length + ' Events geprueft.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
