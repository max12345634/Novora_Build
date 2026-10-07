const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, ModalBuilder,
  PermissionFlagsBits, RoleSelectMenuBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { getGuildSettings, updateGuildSettings } = require('../utils/guildSettings');
const { panel } = require('../utils/theme');
const { SERVER_TYPES, suggest } = require('./presets');
const { panelPayload, sendTicketPanel, categories } = require('./tickets');
const { createPanelEmbed, createVerifyButton } = require('./verify');
const { applicationPanel, sendApplicationPanel } = require('./applications');
const { validHttpUrl } = require('./embeds');
const { testAnswer } = require('./ai');
const menuItems = [
  ['tickets', '🎫 Tickets', 'Kategorien, Formulare und Panel'], ['verify', '✅ Verify', 'Captcha und Rollen'],
  ['welcome', '👋 Welcome / Leave', 'Nachrichten beim Beitritt und Austritt'], ['logs', '📋 Logs', 'Ereignisse und Protokolle'],
  ['applications', '📝 Bewerbungen', 'Bewerbungstypen und Fragen'], ['branding', '🎨 Branding', 'Farben, Bilder und Servername'],
  ['ai', '🤖 KI', 'Wissensbasis und Ticket-Assistent']
];
const row = (...components) => new ActionRowBuilder().addComponents(components);
const button = (id, label, style = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(`setup:${id}`).setLabel(label).setStyle(style);
const input = (id, label, value = '', style = TextInputStyle.Short, max = 1000, required = false) => {
  const builder = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setMaxLength(max).setRequired(required);
  if (value) builder.setValue(String(value).slice(0, max));
  return row(builder);
};
const modal = (id, title, fields) => new ModalBuilder().setCustomId(`setup:${id}`).setTitle(title.slice(0, 45)).addComponents(fields);
function setupMenu() { return row(new StringSelectMenuBuilder().setCustomId('setup:menu').setPlaceholder('System auswählen …')
  .addOptions(menuItems.map(([value, label, description]) => ({ value, label, description })))); }
function baseEmbed(guild, settings = {}) { return panel(guild, settings, { title: '⚙️ Novora Setup', description: 'Wähle ein System. Deine Änderungen gelten nur für diesen Server. Panels werden erst bei „Aktivieren“ veröffentlicht.',
  fields: menuItems.map(([, label, description]) => ({ name: label, value: description, inline: true })) })[0]; }
const back = () => row(button('home', '← Übersicht'));
function systemView(guild, s, section) {
  const c = s[section] || {};
  const fields = section === 'branding' ? [
    { name: 'Projekt', value: s.branding?.projectName || guild.name }, { name: 'Farbe', value: s.branding?.primaryColor || 'Standard' }
  ] : section === 'ai' ? [{ name: 'Modus', value: c.enabled ? (c.autoReply ? 'Automatische Antworten' : 'Nur Vorschläge') : 'Aus' },
    { name: 'FAQ', value: String(c.faq?.length || 0) }] : [{ name: 'Status', value: c.enabled ? '✅ Aktiv' : '○ Inaktiv' }];
  const embeds = panel(guild, s, { title: menuItems.find(v => v[0] === section)?.[1] || section,
    description: 'Konfiguriere die Einstellungen. Prüfe die Vorschau vor der Veröffentlichung.', fields });
  const components = [row(button(`edit:${section}`, 'Bearbeiten', ButtonStyle.Primary),
    button(`preview:${section}`, 'Vorschau'), button(`toggle:${section}`, c.enabled ? 'Deaktivieren' : 'Aktivieren', c.enabled ? ButtonStyle.Danger : ButtonStyle.Success)), back()];
  if (section === 'tickets') return ticketWizard(c, s, guild);
  if (section === 'ai') components.splice(1, 0, row(button('ai-test', 'KI testen'), button('ai-options', 'Antwortmodus')));
  if (section === 'welcome') components.splice(1, 0, row(button('edit-leave', 'Leave gestalten')));
  if (section === 'verify') components.splice(1, 0, row(new ChannelSelectMenuBuilder().setCustomId('setup:pick:verify:channelId').setPlaceholder('Verify-Kanal').addChannelTypes(ChannelType.GuildText)),
    row(new RoleSelectMenuBuilder().setCustomId('setup:pick:verify:roleId').setPlaceholder('Verify-Rolle')));
  if (section === 'applications') components.splice(1, 0, row(new ChannelSelectMenuBuilder().setCustomId('setup:pick:applications:channelId').setPlaceholder('Bewerbungs-Panel').addChannelTypes(ChannelType.GuildText)),
    row(new RoleSelectMenuBuilder().setCustomId('setup:pick:applications:teamRoleId').setPlaceholder('Bewerbungs-Teamrolle')));
  if (section === 'logs') components.splice(1, 0, row(new ChannelSelectMenuBuilder().setCustomId('setup:pick:logs:channelId').setPlaceholder('Logkanal').addChannelTypes(ChannelType.GuildText)));
  return { embeds, components };
}
function ticketWizard(c = {}, settings = {}, guild = { name: 'Server' }) {
  const step = Math.max(1, Math.min(6, c.step || 1)), cats = Array.isArray(c.categories) ? c.categories : categories(c), type = SERVER_TYPES.find(v => v.id === c.serverType);
  const summary = [
    `**Schritt ${step}/6** · ${['Servertyp', 'Server beschreiben', 'Vorschläge', 'Kategorien anpassen', 'Rollen und Kanäle', 'Vorschau und Aktivierung'][step - 1]}`,
    `Typ: ${type?.name || 'noch offen'} · Beschreibung: ${c.serverDescription ? '✓' : '–'} · Kategorien: ${cats.length}`,
    `Panel: ${c.panelChannelId ? `<#${c.panelChannelId}>` : 'fehlt'} · Supportrolle: ${c.teamRoleId ? `<@&${c.teamRoleId}>` : 'fehlt'}`
  ];
  const embeds = panel(guild, settings, { title: '🎫 Ticket-Setup', description: summary.join('\n'),
    fields: step >= 3 ? cats.slice(0, 15).map(v => ({ name: `${v.emoji || '🎫'} ${v.name}${v.enabled === false ? ' (inaktiv)' : ''}`, value: v.description || '—', inline: true })) : [] });
  const components = [];
  if (step === 1) components.push(row(button('type-search', 'Servertyp suchen', ButtonStyle.Primary), button('type-page:0', 'Alle Typen')));
  if (step === 2) components.push(row(button('describe', 'Server beschreiben', ButtonStyle.Primary)));
  if (step === 3) components.push(row(button('suggest', 'Vorschläge erzeugen', ButtonStyle.Primary)));
  if (step === 4) components.push(row(button('category-add', 'Kategorie hinzufügen', ButtonStyle.Primary), button('category-edit', 'Kategorien verwalten')),
    row(button('category-move', 'Reihenfolge ändern')));
  if (step === 5) components.push(row(new ChannelSelectMenuBuilder().setCustomId('setup:pick:tickets:panelChannelId').setPlaceholder('Panel-Kanal').addChannelTypes(ChannelType.GuildText)),
    row(new RoleSelectMenuBuilder().setCustomId('setup:pick:tickets:teamRoleId').setPlaceholder('Supportrolle')),
    row(new ChannelSelectMenuBuilder().setCustomId('setup:pick:tickets:categoryId').setPlaceholder('Ticket-Kategorie').addChannelTypes(ChannelType.GuildCategory).setMinValues(0)),
    row(new ChannelSelectMenuBuilder().setCustomId('setup:pick:tickets:logChannelId').setPlaceholder('Logkanal').addChannelTypes(ChannelType.GuildText).setMinValues(0)));
  if (step === 6) {
    try { embeds.push(...panelPayload(guild, settings).embeds); } catch { /* Vor Konfiguration ist keine Panel-Vorschau verfügbar. */ }
    components.push(row(button('activate-ticket', 'Panel veröffentlichen', ButtonStyle.Success)));
  }
  components.push(row(button('step:back', '← Zurück'), button('step:next', 'Weiter →', ButtonStyle.Primary), button('home', 'Übersicht')));
  return { embeds, components };
}
function typePicker(query = '', page = 0) {
  const matches = SERVER_TYPES.filter(v => `${v.name} ${v.family}`.toLowerCase().includes(query.toLowerCase()));
  const total = Math.max(1, Math.ceil(matches.length / 25)), current = Math.max(0, Math.min(page, total - 1));
  const choices = matches.slice(current * 25, (current + 1) * 25);
  return { content: `${matches.length} passende Servertypen · Seite ${current + 1}/${total}`,
    components: [row(new StringSelectMenuBuilder().setCustomId('setup:type-select').setPlaceholder('Servertyp wählen').addOptions(
      choices.length ? choices.map(v => ({ label: v.name.slice(0, 100), value: v.id, description: v.family })) : [{ label: 'Keine Treffer', value: 'none' } ])),
    row(button(`type-page:${Math.max(0, current - 1)}`, '←'), button(`type-page:${Math.min(total - 1, current + 1)}`, '→'), button('type-search', 'Suche'))], ephemeral: true };
}
function brandingModal(c = {}, page = 1) {
  const fields = page === 1 ? [input('projectName', 'Server-/Projektname', c.projectName, undefined, 80),
    input('primaryColor', 'Hauptfarbe (z. B. #5865F2)', c.primaryColor, undefined, 7),
    input('accentColor', 'Akzentfarbe', c.accentColor, undefined, 7),
    input('footerText', 'Footer-Text', c.footerText, undefined, 200),
    input('logoUrl', 'Logo URL', c.logoUrl, undefined, 500)] : [
    input('panelBannerUrl', 'Panel-Banner URL', c.panelBannerUrl, undefined, 500),
    input('footerImageUrl', 'Grafisches Footer-Bild URL', c.footerImageUrl, undefined, 500),
    input('thumbnailUrl', 'Thumbnail URL', c.thumbnailUrl, undefined, 500),
    input('defaultImageUrl', 'Standard-Embed-Bild URL', c.defaultImageUrl, undefined, 500)];
  return modal(`branding:${page}`, `Branding ${page}/2`, fields);
}
function editModal(section, c = {}) {
  if (section === 'branding') return brandingModal(c);
  if (section === 'verify') return modal('config:verify', 'Verify gestalten', [input('title', 'Titel', c.title), input('description', 'Beschreibung', c.description, TextInputStyle.Paragraph, 1500),
    input('imageUrl', 'Verify-Bild URL', c.imageUrl, undefined, 500), input('removeRoleId', 'Rolle entfernen: ID (optional)', c.removeRoleId, undefined, 20),
    input('failureAction', 'Bei Fehler: retry / timeout / kick', c.failureAction || 'retry', undefined, 7)]);
  if (section === 'logs') return modal('config:logs', 'Logging', [input('profile', 'basis / erweitert / alles', c.profile || 'basis', undefined, 10, true)]);
  if (section === 'welcome') return modal('config:welcome', 'Welcome gestalten', [input('title', 'Titel', c.title || 'Willkommen bei %SERVERNAME%'),
    input('description', 'Text mit Variablen', c.description || 'Hallo %MENTION%!', TextInputStyle.Paragraph, 1500),
    input('channelId', 'Welcome-Kanal ID', c.channelId, undefined, 20), input('imageUrl', 'Bild URL', c.imageUrl, undefined, 500),
    input('footerImageUrl', 'Footer-Bild URL', c.footerImageUrl, undefined, 500)]);
  if (section === 'applications') return modal('config:applications', 'Bewerbungstyp erstellen', [input('name', 'Name des Bewerbungstyps', '', undefined, 80, true),
    input('description', 'Beschreibung', '', TextInputStyle.Paragraph, 500), input('questions', 'Fragen (eine pro Zeile, maximal 20)', '', TextInputStyle.Paragraph, 1500),
    input('imageUrl', 'Bild URL', '', undefined, 500)]);
  if (section === 'ai') return modal('config:ai', 'KI-Wissensbasis', [input('description', 'Serverbeschreibung', c.description, TextInputStyle.Paragraph, 1500),
    input('faq', 'FAQ: Frage|Antwort je Zeile', (c.faq || []).map(v => `${v.q}|${v.a}`).join('\n'), TextInputStyle.Paragraph, 2500),
    input('style', 'Antwortstil', c.style || 'Freundlich und knapp', undefined, 100),
    input('links', 'Wichtige Links (je Zeile)', (c.links || []).join('\n'), TextInputStyle.Paragraph, 1000)]);
  return modal('config:tickets', 'Ticket-Panel gestalten', [input('panelTitle', 'Panel-Titel', c.panelTitle),
    input('panelDescription', 'Panel-Beschreibung', c.panelDescription, TextInputStyle.Paragraph, 1500),
    input('panelImageUrl', 'Panel-Bild URL', c.panelImageUrl, undefined, 500),
    input('openImageUrl', 'Ticket-eröffnet Bild URL', c.openImageUrl, undefined, 500)]);
}
function readFields(i) { return Object.fromEntries(i.fields.fields.map(f => [f.customId, f.value.trim()])); }
function validateUrls(values) {
  for (const [key, value] of Object.entries(values)) if (/Url$/.test(key) && value && !validHttpUrl(value)) throw new Error(`Ungültige Bild-URL bei ${key}.`);
}
async function patch(i, key, delta) { const s = await updateGuildSettings(i.guildId, old => ({ [key]: { ...old[key], ...delta } })); return s; }
async function view(i, section, s) { await i.update(systemView(i.guild, s, section)); }
async function activate(i, section, s) {
  const c = s[section] || {}, me = i.guild.members.me || await i.guild.members.fetchMe();
  if (section === 'tickets' || section === 'verify' || section === 'applications') {
    const channelId = section === 'verify' ? c.channelId : section === 'applications' ? c.channelId : c.panelChannelId;
    const channel = await i.guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) throw new Error('Der ausgewählte Panel-Kanal fehlt.');
    if (!channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) throw new Error('Novora benötigt im Panel-Kanal Nachrichten senden und Links einbetten.');
    const role = await i.guild.roles.fetch(section === 'verify' ? c.roleId : c.teamRoleId).catch(() => null);
    if (!role) throw new Error('Die ausgewählte Rolle fehlt.');
    if (section === 'verify' && (!me.permissions.has(PermissionFlagsBits.ManageRoles) || role.position >= me.roles.highest.position)) throw new Error('Novora benötigt Rollen verwalten und muss über der Verify-Rolle stehen.');
    if (section === 'tickets' && (!me.permissions.has(PermissionFlagsBits.ManageChannels) || !categories(c).length)) throw new Error('Novora benötigt Kanäle verwalten und mindestens eine aktive Ticket-Kategorie.');
    if (section === 'applications' && !me.permissions.has(PermissionFlagsBits.ManageChannels)) throw new Error('Novora benötigt Kanäle verwalten.');
    if (section === 'tickets') { await patch(i, section, { enabled: true }); await sendTicketPanel(channel, i.guild); }
    if (section === 'verify') { const old = c.panelMessageId && await channel.messages.fetch(c.panelMessageId).catch(() => null);
      const payload = { embeds: createPanelEmbed(i.guild, c, s), components: [createVerifyButton()] };
      const msg = old ? await old.edit(payload) : await channel.send(payload);
      await patch(i, section, { enabled: true, panelMessageId: msg.id }); }
    if (section === 'applications') { await patch(i, section, { enabled: true }); await sendApplicationPanel(channel, i.guild); }
  } else {
    if (section === 'logs' && !c.channelId) throw new Error('Bitte zuerst einen Logkanal auswählen.');
    await patch(i, section, { enabled: true });
  }
  await view(i, section, await getGuildSettings(i.guildId));
}
async function handleSetupInteraction(i) {
  if (!i.inGuild() || !i.customId?.startsWith('setup:')) return false;
  if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) { await i.reply({ content: 'Du benötigst Server verwalten.', ephemeral: true }); return true; }
  const parts = i.customId.split(':'), action = parts[1];
  try {
    if (action === 'home') { const s = await getGuildSettings(i.guildId); await i.update({ embeds: [baseEmbed(i.guild, s)], components: [setupMenu()] }); return true; }
    if (action === 'menu') { await view(i, i.values[0], await getGuildSettings(i.guildId)); return true; }
    if (action === 'type-search') { await i.showModal(modal('search', 'Servertyp suchen', [input('query', 'Name oder Stichwort', '', undefined, 80)])); return true; }
    if (action === 'search' && i.isModalSubmit()) { await i.reply(typePicker(i.fields.getTextInputValue('query'))); return true; }
    if (action === 'type-page') { await i.reply(typePicker('', Number(parts[2]))); return true; }
    if (action === 'type-select' && i.isStringSelectMenu()) {
      const type = SERVER_TYPES.find(v => v.id === i.values[0]); if (!type) { await i.reply({ content: 'Kein Servertyp gewählt.', ephemeral: true }); return true; }
      const s = await patch(i, 'tickets', { serverType: type.id, step: 2 }); await i.reply({ ...ticketWizard(s.tickets, s, i.guild), ephemeral: true }); return true;
    }
    if (action === 'step') {
      const s = await getGuildSettings(i.guildId), step = Math.max(1, Math.min(6, (s.tickets?.step || 1) + (parts[2] === 'next' ? 1 : -1)));
      const next = await patch(i, 'tickets', { step }); await view(i, 'tickets', next); return true;
    }
    if (action === 'describe') { const c = (await getGuildSettings(i.guildId)).tickets; await i.showModal(modal('description', 'Beschreibe deinen Server', [input('text', 'Welche Community betreibst du?', c.serverDescription, TextInputStyle.Paragraph, 1500, true)])); return true; }
    if (action === 'description' && i.isModalSubmit()) { const s = await patch(i, 'tickets', { serverDescription: i.fields.getTextInputValue('text'), step: 3 }); await i.reply({ ...ticketWizard(s.tickets, s, i.guild), ephemeral: true }); return true; }
    if (action === 'suggest') { const s = await getGuildSettings(i.guildId), cs = suggest(s.tickets.serverType, s.tickets.serverDescription);
      const next = await patch(i, 'tickets', { categories: cs, step: 4 }); await view(i, 'tickets', next); return true; }
    if (action === 'category-add' || action === 'category-edit' || action === 'category-move') {
      const c = (await getGuildSettings(i.guildId)).tickets;
      if (action === 'category-move') { await i.showModal(modal('category-order', 'Kategorien sortieren', [input('ids', 'IDs in gewünschter Reihenfolge, Komma', categories(c).map(v => v.id).join(','), TextInputStyle.Paragraph, 500, true)])); return true; }
    if (action === 'category-edit') { const opts = (c.categories || []).slice(0, 25).map(v => ({ label: v.name, value: v.id }));
        if (!opts.length) throw new Error('Erstelle zuerst eine Kategorie.');
        await i.reply({ content: 'Kategorie zum Bearbeiten auswählen', ephemeral: true, components: [row(new StringSelectMenuBuilder().setCustomId('setup:category-select').addOptions(opts))] }); return true; }
      await i.showModal(categoryModal()); return true;
    }
    if (action === 'category-select') { const c = (await getGuildSettings(i.guildId)).tickets;
      const cat = (c.categories || []).find(v => v.id === i.values[0]); if (!cat) return true;
      await i.update({ content: `${cat.emoji || '🎫'} ${cat.name} · ${cat.enabled === false ? 'inaktiv' : 'aktiv'}`, components: [row(
        button(`category-open:${cat.id}`, 'Bearbeiten'), button(`category-extra:${cat.id}`, 'Rollen & Limits'),
        button(`category-toggle:${cat.id}`, cat.enabled === false ? 'Aktivieren' : 'Deaktivieren'),
        button(`category-remove:${cat.id}`, 'Entfernen', ButtonStyle.Danger))] }); return true; }
    if (action === 'category-open') { const c = (await getGuildSettings(i.guildId)).tickets, cat = c.categories?.find(v => v.id === parts[2]);
      if (cat) await i.showModal(categoryModal(cat)); return true; }
    if (action === 'category-extra') { const c = (await getGuildSettings(i.guildId)).tickets, cat = c.categories?.find(v => v.id === parts[2]);
      if (cat) await i.showModal(modal(`category-extras:${cat.id}`, 'Kategorie: Zuständigkeit', [
        input('roleId', 'Supportrolle ID', cat.roleId, undefined, 20), input('parentId', 'Discord-Kategorie ID', cat.parentId, undefined, 20),
        input('logChannelId', 'Logkanal ID', cat.logChannelId, undefined, 20), input('openImageUrl', 'Ticket-Bild URL', cat.openImageUrl, undefined, 500),
        input('maxOpen', 'Maximale offene Tickets (1–10)', cat.maxOpen || '1', undefined, 2)])); return true; }
    if (action === 'category-toggle' || action === 'category-remove') { const s = await getGuildSettings(i.guildId), cats = s.tickets.categories || [];
      const next = await patch(i, 'tickets', { categories: action === 'category-remove' ? cats.filter(v => v.id !== parts[2]) : cats.map(v => v.id === parts[2] ? { ...v, enabled: v.enabled === false } : v) });
      await view(i, 'tickets', next); return true; }
    if (action === 'category-extras' && i.isModalSubmit()) { const f = readFields(i), s = await getGuildSettings(i.guildId);
      validateUrls(f); if (!/^\d{1,2}$/.test(f.maxOpen) || Number(f.maxOpen) < 1 || Number(f.maxOpen) > 10) throw new Error('Maximum muss 1–10 sein.');
      const cats = s.tickets.categories.map(v => v.id === parts[2] ? { ...v, ...f, maxOpen: Number(f.maxOpen) } : v);
      const next = await patch(i, 'tickets', { categories: cats }); await i.reply({ ...ticketWizard(next.tickets, next, i.guild), ephemeral: true }); return true; }
    if (action === 'category-save' && i.isModalSubmit()) {
      const f = readFields(i), s = await getGuildSettings(i.guildId), old = s.tickets.categories || [], id = parts[2] || f.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
      if (!id) throw new Error('Kategorie-Name fehlt.');
      const existing = old.find(v => v.id === id) || {};
      const cat = { ...existing, id, name: f.name.slice(0, 80), emoji: f.emoji || '🎫', description: f.description.slice(0, 100),
        prefix: (f.prefix || id).replace(/[^a-z0-9-]/gi, '-').slice(0, 30), enabled: f.enabled !== 'nein',
        questions: f.questions.split('\n').map((label, n) => ({ id: `q${n + 1}`, label: label.trim().slice(0, 45), style: 'paragraph' })).filter(q => q.label).slice(0, 20) };
      const next = await patch(i, 'tickets', { categories: [...old.filter(v => v.id !== id), cat] });
      await i.reply({ ...ticketWizard(next.tickets, next, i.guild), ephemeral: true }); return true;
    }
    if (action === 'category-order' && i.isModalSubmit()) { const ids = i.fields.getTextInputValue('ids').split(',').map(v => v.trim()); const old = (await getGuildSettings(i.guildId)).tickets.categories || [];
      if (ids.length !== old.length || new Set(ids).size !== old.length || ids.some(v => !old.find(c => c.id === v))) throw new Error('Gib jede Kategorie-ID genau einmal an.');
      const next = await patch(i, 'tickets', { categories: ids.map(id => old.find(v => v.id === id)) }); await i.reply({ ...ticketWizard(next.tickets, next, i.guild), ephemeral: true }); return true; }
    if (action === 'pick') { const section = parts[2], field = parts[3]; const s = await patch(i, section, { [field]: i.values[0] || null }); await view(i, section, s); return true; }
    if (action === 'activate-ticket') { await activate(i, 'tickets', await getGuildSettings(i.guildId)); return true; }
    if (action === 'edit') { const s = await getGuildSettings(i.guildId); await i.showModal(editModal(parts[2], s[parts[2]])); return true; }
    if (action === 'edit-leave') { const s = await getGuildSettings(i.guildId); await i.showModal(modal('config:leave', 'Leave gestalten', [
      input('title', 'Titel', s.leave?.title || 'Auf Wiedersehen'), input('description', 'Text mit Variablen', s.leave?.description || '%USERNAME% hat den Server verlassen.', TextInputStyle.Paragraph, 1500),
      input('channelId', 'Leave-Kanal ID', s.leave?.channelId, undefined, 20), input('imageUrl', 'Bild URL', s.leave?.imageUrl, undefined, 500),
      input('footerImageUrl', 'Footer-Bild URL', s.leave?.footerImageUrl, undefined, 500)])); return true; }
    if (action === 'ai-options') { const s = await getGuildSettings(i.guildId); await i.reply({ content: 'KI-Ticket-Assistent: Modus wählen', ephemeral: true,
      components: [row(button('ai-mode:auto', 'Automatische Antworten'), button('ai-mode:staff', 'Nur Staff-Vorschläge'), button('ai-mode:off', 'Aus'))] }); return true; }
    if (action === 'ai-mode') { const mode = parts[2], s = await patch(i, 'ai', { enabled: mode !== 'off', ticketEnabled: mode !== 'off', autoReply: mode === 'auto' });
      await i.update({ content: `KI-Modus: ${mode}`, components: [] }); return true; }
    if (action === 'branding-page') { const s = await getGuildSettings(i.guildId); await i.showModal(brandingModal(s.branding, 2)); return true; }
    if (action === 'branding' && i.isModalSubmit()) { const f = readFields(i); validateUrls(f);
      const s = await patch(i, 'branding', f); await i.reply({ ...systemView(i.guild, s, 'branding'), ephemeral: true,
        components: [row(button('branding-page', 'Weitere Bilder')), ...systemView(i.guild, s, 'branding').components] }); return true; }
    if (action === 'config' && i.isModalSubmit()) {
      const section = parts[2], f = readFields(i); validateUrls(f);
      if (section === 'verify' && !['retry', 'timeout', 'kick'].includes(f.failureAction)) throw new Error('Aktion muss retry, timeout oder kick sein.');
      if (section === 'logs' && !['basis', 'erweitert', 'alles'].includes(f.profile)) throw new Error('Profil muss basis, erweitert oder alles sein.');
      if (section === 'applications') {
        const s = await getGuildSettings(i.guildId), types = s.applications.types || [], id = f.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
        const type = { id, name: f.name, description: f.description, imageUrl: f.imageUrl,
          questions: f.questions.split('\n').map((label, n) => ({ id: `q${n + 1}`, label: label.trim().slice(0, 45) })).filter(q => q.label).slice(0, 20), enabled: true };
        await patch(i, section, { types: [...types.filter(v => v.id !== id), type] });
      } else if (section === 'ai') await patch(i, section, { description: f.description, style: f.style,
        faq: f.faq.split('\n').map(line => { const [q, ...a] = line.split('|'); return { q: q?.trim(), a: a.join('|').trim() }; }).filter(v => v.q && v.a).slice(0, 30),
        links: f.links.split('\n').map(v => v.trim()).filter(Boolean).slice(0, 30) });
      else await patch(i, section, section === 'welcome' || section === 'leave' ? { ...f, enabled: Boolean(f.channelId) } : f);
      const s = await getGuildSettings(i.guildId); await i.reply({ ...systemView(i.guild, s, section), ephemeral: true }); return true;
    }
    if (action === 'preview') { const s = await getGuildSettings(i.guildId), section = parts[2];
      const embeds = section === 'tickets' ? panelPayload(i.guild, s).embeds : section === 'verify' ? createPanelEmbed(i.guild, s.verify, s) :
        section === 'applications' ? applicationPanel(i.guild, s) : panel(i.guild, s, { title: section, description: 'Vorschau des aktuellen Designs' });
      await i.reply({ embeds: Array.isArray(embeds) ? embeds : [embeds], ephemeral: true }); return true; }
    if (action === 'toggle') { const section = parts[2], s = await getGuildSettings(i.guildId);
      if (s[section]?.enabled) { const next = await patch(i, section, { enabled: false }); await view(i, section, next); }
      else await activate(i, section, s); return true; }
    if (action === 'ai-test') { const s = await getGuildSettings(i.guildId); await i.showModal(modal('ai-question', 'Novora testen', [input('question', 'Deine Testfrage', '', TextInputStyle.Paragraph, 500, true)])); return true; }
    if (action === 'ai-question') { const s = await getGuildSettings(i.guildId); await i.reply({ content: await testAnswer(s, i.fields.getTextInputValue('question')), ephemeral: true }); return true; }
  } catch (error) { const payload = { content: `Novora: ${error.message?.slice(0, 200) || 'Ein Fehler ist aufgetreten.'}`, ephemeral: true };
    if (i.replied || i.deferred) await i.followUp(payload).catch(() => {}); else await i.reply(payload).catch(() => {}); return true; }
  return false;
}
function categoryModal(c = {}) { return modal(`category-save:${c.id || ''}`, c.id ? 'Kategorie bearbeiten' : 'Neue Ticket-Kategorie', [
  input('name', 'Name', c.name, undefined, 80, true), input('emoji', 'Emoji', c.emoji, undefined, 30),
  input('description', 'Beschreibung', c.description, undefined, 100),
  input('prefix', 'Ticket-Kanal-Präfix', c.prefix, undefined, 30),
  input('questions', 'Formularfragen je Zeile (max. 20)', (c.questions || []).map(q => q.label).join('\n'), TextInputStyle.Paragraph, 1000) ]); }
module.exports = { baseEmbed, setupMenu, handleSetupInteraction, ticketWizard, typePicker, categoryModal };
