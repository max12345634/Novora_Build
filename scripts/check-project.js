const fs = require('node:fs');
const path = require('node:path');
const { GatewayIntentBits } = require('discord.js');
const { collectCommandFiles } = require('../src/loaders/commands');
const { createCaptchaImage } = require('../src/features/verify');
const { makeForm } = require('../src/features/orders');
const { setupMenu, ticketWizard, typePicker, categoryModal, systemView, designModal, categoryManage, applicationManage } = require('../src/features/setup');
const { applicationPanel } = require('../src/features/applications');
const { createPanelEmbed, createVerifyButton } = require('../src/features/verify');
const { createLifecycleEmbeds } = require('../src/features/welcome');
const { SERVER_TYPES, suggest } = require('../src/features/presets');
const { form, panelPayload } = require('../src/features/tickets');
const { modal: applicationModal } = require('../src/features/applications');
const { migrateGuild } = require('../src/utils/guildSettings');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
function commandOptions(options = [], context = '') {
  let optional = false;
  for (const option of options) {
    if (option.required === false || option.required === undefined && option.type !== 1 && option.type !== 2) optional = true;
    if (option.required === true && optional) throw new Error(`Pflichtfeld nach optionalem Feld: ${context}/${option.name}`);
    assert((option.name || '').length <= 32, `Command-Name zu lang: ${context}`);
    if (option.options) commandOptions(option.options, `${context}/${option.name}`);
  }
  assert(options.length <= 25, `Zu viele Command-Optionen: ${context}`);
}
function checkEmbed(e) {
  assert((e.title || '').length <= 256 && (e.description || '').length <= 4096, 'Embed-Titel/Beschreibung zu lang');
  assert((e.fields || []).length <= 25 && (e.footer?.text || '').length <= 2048, 'Embed-Felder/Footer zu lang');
  let chars = (e.title || '').length + (e.description || '').length + (e.footer?.text || '').length;
  for (const field of e.fields || []) { assert(field.name.length <= 256 && field.value.length <= 1024, 'Embed-Feld zu lang'); chars += field.name.length + field.value.length; }
  assert(chars <= 6000, 'Embed mit mehr als 6000 Zeichen');
}
function checkMessage(payload) {
  const embeds = (payload.embeds || []).map(e => typeof e.toJSON === 'function' ? e.toJSON() : e);
  assert(embeds.length <= 10, 'Zu viele Embeds'); embeds.forEach(checkEmbed);
  const rows = (payload.components || []).map(r => typeof r.toJSON === 'function' ? r.toJSON() : r);
  assert(rows.length <= 5, 'Mehr als fünf Action Rows');
  for (const row of rows) {
    assert(row.components.length <= 5, 'Mehr als fünf Buttons');
    for (const component of row.components) {
      assert((component.custom_id || '').length <= 100, 'Custom ID zu lang');
      if (component.options) assert(component.options.length >= 1 && component.options.length <= 25, 'Select-Menü außerhalb 1–25');
    }
  }
}
function checkModal(m) {
  const json = m.toJSON(); assert(json.components.length >= 1 && json.components.length <= 5, 'Modal-Fragen außerhalb 1–5');
  assert(json.custom_id.length <= 100, 'Modal-Custom ID zu lang');
  for (const row of json.components) for (const c of row.components) {
    assert(c.label.length <= 45 && c.max_length <= 4000 && c.custom_id.length <= 100, 'Text Input über Discord-Limit');
  }
}
async function main() {
  for (const file of walk('src').filter(v => v.endsWith('.js'))) {
    require(path.resolve(file)); // Laden prüft gleichzeitig Imports.
  }
  assert(Number.isInteger(GatewayIntentBits.GuildModeration), 'GuildModeration Intent fehlt');
  const commandNames = new Set();
  for (const file of await collectCommandFiles(path.resolve('src/commands'))) {
    const command = require(file), payload = command.data?.toJSON();
    assert(payload && typeof command.execute === 'function', `Ungültiger Command: ${file}`);
    assert(!commandNames.has(payload.name), `Doppelter Command: ${payload.name}`);
    commandNames.add(payload.name); commandOptions(payload.options, payload.name);
  }
  const eventFiles = walk('src/events').filter(v => v.endsWith('.js'));
  for (const file of eventFiles) { const e = require(path.resolve(file)); assert(e.name && typeof e.execute === 'function', `Ungültiges Event: ${file}`); }
  const png = createCaptchaImage('234 567').attachment;
  assert(Buffer.isBuffer(png) && png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'Captcha ist kein PNG');
  checkModal(makeForm()); checkModal(applicationModal());
  checkModal(categoryModal());
  assert(SERVER_TYPES.length >= 100 && new Set(SERVER_TYPES.map(v => v.id)).size === SERVER_TYPES.length, 'Servertypen fehlen oder IDs doppelt');
  for (const type of SERVER_TYPES) {
    const categories = suggest(type.id, ''); assert(categories.length > 0 && categories.length <= 25, `Preset ungültig: ${type.id}`);
    for (const c of categories) { assert(c.id.length <= 40 && c.name.length <= 100 && c.questions.length <= 20, `Kategorie ungültig: ${c.id}`);
      checkModal(form(c, 0, 'test')); }
  }
  const guild = { name: 'Beispiel', id: '123456789012345678' }, categories = suggest('community');
  const settings = migrateGuild({ tickets: { categories }, branding: { footerImageUrl: 'https://example.com/footer.png' } });
  checkMessage(panelPayload(guild, settings));
  for (let step = 1; step <= 6; step++) checkMessage(ticketWizard({ ...settings.tickets, step }, settings, guild));
  checkMessage(typePicker('', 0)); checkMessage({ components: [setupMenu()] });
  for (const section of ['tickets', 'verify', 'welcome', 'logs', 'applications', 'branding', 'ai']) {
    checkMessage(systemView(guild, settings, section)); checkModal(designModal(section));
  }
  checkMessage(categoryManage(categories[0]));
  checkMessage(applicationManage({ id: 'staff', name: 'Staff', enabled: true }));
  checkMessage({ embeds: createPanelEmbed(guild, { title: 'Verifizierung' }, settings), components: [createVerifyButton()] });
  checkMessage({ embeds: applicationPanel(guild, settings) });
  const member = { guild, id: '123456789012345678', user: { username: 'Test', createdAt: new Date() }, joinedAt: new Date() };
  checkMessage({ embeds: createLifecycleEmbeds(member, { title: 'Hallo %USERNAME%', description: '%MENTION%' }, 5, settings) });
  const legacy = migrateGuild({ tickets: { categories: { legacy: { label: 'Alte Kategorie' } } }, applications: { teamRoleId: '123' } });
  assert(legacy.tickets.categories[0].name === 'Alte Kategorie' && legacy.applications.types.length, 'Migration fehlgeschlagen');
  if (fs.existsSync('data/guild-settings.json')) JSON.parse(fs.readFileSync('data/guild-settings.json', 'utf8'));
  console.log(`Novora-Check: ${commandNames.size} Commands, ${eventFiles.length} Events, ${SERVER_TYPES.length} Presets, Komponenten und Migration gültig.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
