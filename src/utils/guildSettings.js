const fs = require('node:fs/promises');
const path = require('node:path');
const settingsPath = process.env.NOVORA_SETTINGS_PATH || path.join(process.cwd(), 'data', 'guild-settings.json');
const VERSION = 2;
let queue = Promise.resolve();
const clone = (value) => JSON.parse(JSON.stringify(value));

function migrateGuild(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const tickets = { ...(source.tickets || {}) };
  if (tickets.categories && !Array.isArray(tickets.categories)) {
    tickets.categories = Object.entries(tickets.categories).map(([id, c]) => ({ id, name: c.name || c.label || id, ...c }));
  }
  if (tickets.enabled && !tickets.categories) {
    // Bereits veröffentlichte v0.2-Panels verwenden diese IDs. Nur Altserver erhalten sie.
    tickets.categories = [
      ['general', 'Allgemeiner Support'], ['technical', 'Technische Hilfe'],
      ['account', 'Konto und Zugang'], ['feedback', 'Feedback und Vorschläge'], ['other', 'Sonstiges']
    ].map(([id, name]) => ({ id, name, prefix: id, emoji: '🎫', description: name, enabled: true,
      questions: [{ id: 'topic', label: 'Thema', style: 'paragraph' }] }));
  }
  const applications = { ...(source.applications || {}) };
  if (!applications.types && (applications.channelId || applications.teamRoleId)) {
    applications.types = [{ id: 'team', name: 'Team', emoji: '📝', enabled: true, roleId: applications.teamRoleId,
      questions: [
        { id: 'age', label: 'Wie alt bist du?', style: 'short' },
        { id: 'experience', label: 'Welche Erfahrungen hast du?' },
        { id: 'why', label: 'Warum möchtest du dich bewerben?' },
        { id: 'time', label: 'Wie viel Zeit hast du?', style: 'short' },
        { id: 'more', label: 'Weitere Informationen', required: false }
      ] }];
  }
  const ai = { ...(source.ai || {}) };
  if (!Array.isArray(ai.channelIds)) ai.channelIds = ai.channelId ? [ai.channelId] : [];
  ai.channelIds = [...new Set(ai.channelIds.filter(value => typeof value === 'string' && /^\d{17,20}$/.test(value)))].slice(0, 5);
  return { ...source, schemaVersion: VERSION, branding: { ...(source.branding || {}) }, tickets,
    applications, ai };
}
async function readAllSettings() {
  try {
    const data = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Ungültige Guild-Konfiguration.');
    return data;
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error; // Beschädigte Dateien niemals überschreiben.
  }
}
async function writeAllSettings(settings) {
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  const tempPath = `${settingsPath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    await fs.writeFile(tempPath, JSON.stringify(settings, null, 2), { flag: 'wx', mode: 0o600 });
    await fs.rename(tempPath, settingsPath);
  } finally {
    await fs.unlink(tempPath).catch(() => {});
  }
}
async function getGuildSettings(guildId) {
  await queue;
  const all = await readAllSettings();
  return migrateGuild(clone(all[guildId] || {}));
}
function updateGuildSettings(guildId, update) {
  const operation = queue.then(async () => {
    const all = await readAllSettings();
    const old = migrateGuild(all[guildId]);
    const delta = typeof update === 'function' ? await update(clone(old)) : update;
    all[guildId] = migrateGuild({ ...old, ...delta });
    await writeAllSettings(all);
    return clone(all[guildId]);
  });
  queue = operation.then(() => {}, () => {});
  return operation;
}
module.exports = { VERSION, migrateGuild, getGuildSettings, updateGuildSettings, readAllSettings };
