const { randomBytes } = require('node:crypto');
const { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType, FileUploadBuilder, LabelBuilder,
  ModalBuilder, PermissionFlagsBits, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
  UserSelectMenuBuilder, RoleSelectMenuBuilder } = require('discord.js');
const { getGuildSettings, updateGuildSettings } = require('../utils/guildSettings');
const { panel } = require('../utils/theme');
const { sendLog } = require('../utils/auditLog');
const { suggest } = require('./presets');
const { logger } = require('../utils/logger');
const { field } = require('../utils/auditLog');
const { testAnswer } = require('./ai');
const drafts = new Map();
const CATEGORY_ID = 'ticket:category';
const TOPIC = 'novora-ticket:';
const DEFAULT_CATEGORIES = Object.fromEntries(suggest('community').map(c => [c.id, { label: c.name, emoji: c.emoji, description: c.description }]));
const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeName = (v) => String(v || 'user').toLowerCase().normalize('NFKD').replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 35);
const id = () => randomBytes(5).toString('hex').toUpperCase();
const categories = (c) => (Array.isArray(c.categories) ? c.categories : Object.entries(c.categories || {}).map(([key, v]) => ({ id: key, name: v.name || v.label, ...v }))).filter(v => v.enabled !== false);
function parseTopic(value = '') {
  if (!value.startsWith(TOPIC)) return null;
  const [requesterId, caseId, state, ownerId] = value.slice(TOPIC.length).split(':');
  return /^\d{17,20}$/.test(requesterId) ? { requesterId, caseId, state, ownerId } : null;
}
function controls(ticket) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:claim').setLabel(ticket.ownerId ? 'Freigeben' : 'Übernehmen').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ticket:close-request').setLabel('Schließung anfragen').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ticket:close').setLabel('Schließen').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ticket:transcript').setLabel('Transcript').setStyle(ButtonStyle.Secondary)
  ), new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('ticket:actions').setPlaceholder('Weitere Ticket-Aktionen').addOptions(
    { label: 'Informationen', value: 'info', emoji: 'ℹ️' }, { label: 'Umbenennen', value: 'rename', emoji: '✏️' },
    { label: 'Kategorie ändern', value: 'category', emoji: '🏷️' }, { label: 'Priorität ändern', value: 'priority', emoji: '🚩' },
    { label: 'Nutzer hinzufügen', value: 'add', emoji: '➕' }, { label: 'Nutzer entfernen', value: 'remove', emoji: '➖' },
    { label: 'Staff-Notiz schreiben', value: 'note', emoji: '🗒️' }, { label: 'Staff-Notizen ansehen', value: 'notes', emoji: '📋' },
    { label: 'KI-Antwort vorschlagen', value: 'ai', emoji: '🤖' },
    { label: 'Ticket löschen', value: 'delete', emoji: '🗑️' }
  ))];
}
function form(category, page = 0, token = '') {
  const questions = (category.questions?.length ? category.questions : [{ id: 'issue', label: 'Wobei brauchst du Hilfe?', style: 'paragraph' }]);
  const components = questions.slice(page * 5, page * 5 + 5).map(q => {
    const label = new LabelBuilder().setLabel(q.label.slice(0, 45));
    if (q.type === 'file') return label.setFileUploadComponent(new FileUploadBuilder().setCustomId(q.id)
      .setMinValues(q.required === false ? 0 : 1).setMaxValues(Math.min(q.maxFiles || 3, 10)).setRequired(q.required !== false));
    return label.setTextInputComponent(new TextInputBuilder().setCustomId(q.id)
      .setStyle(q.style === 'short' ? TextInputStyle.Short : TextInputStyle.Paragraph)
      .setRequired(q.required !== false).setMaxLength(Math.min(q.maxLength || 1000, 4000)));
  });
  return new ModalBuilder().setCustomId(`ticket:form:${category.id}:${page}:${token}`).setTitle(`Ticket: ${category.name}`.slice(0, 45))
    .addLabelComponents(components);
}
function formatAnswer(answer) {
  if (Array.isArray(answer)) return answer.map(file => `[${String(file.name || 'Anhang').slice(0, 80)}](${file.url})`).join('\n').slice(0, 700) || '—';
  return String(answer || '—').slice(0, 700);
}
function openCount(config, categoryId) {
  return Object.values(config.records || {}).filter(ticket => ticket.categoryId === categoryId && ticket.state === 'open').length;
}
function categoryAtCapacity(config, category) {
  return Number(category.capacity) > 0 && openCount(config, category.id) >= Number(category.capacity);
}
function canClaim(ticket, userId) { return ticket?.requesterId !== userId; }
function panelPayload(guild, settings) {
  const c = settings.tickets || {};
  const choices = categories(c).slice(0, 25);
  if (!choices.length) throw new Error('Mindestens eine aktive Ticket-Kategorie fehlt.');
  return { embeds: panel(guild, settings, { title: c.panelTitle || `🎫 ${settings.branding?.projectName || guild.name} · Support`,
    description: c.panelDescription || 'Wähle unten den passenden Bereich. Danach kannst du dein Anliegen in einem privaten Formular beschreiben.', imageUrl: c.panelImageUrl,
    footerImageUrl: c.footerImageUrl, thumbnailUrl: c.thumbnailUrl, footerText: c.footerText, color: c.color }), components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
      .setCustomId(CATEGORY_ID).setPlaceholder('Wähle dein Anliegen …').addOptions(choices.map(v => {
        const count = openCount(c, v.id), capacity = Number(v.capacity) || 0;
        const availability = categoryAtCapacity(c, v) ? `Auslastung ${count}/${capacity} · Team-Pings pausiert` : capacity ? `Offen ${count}/${capacity}` : v.description || v.name;
        return { label: v.name.slice(0, 100), value: v.id, description: String(availability).slice(0, 100), emoji: v.emoji || undefined };
      })))], allowedMentions: { parse: [] } };
}
async function sendTicketPanel(channel, guild) {
  const settings = await getGuildSettings(guild.id);
  const c = settings.tickets;
  const payload = panelPayload(guild, settings);
  if (c.panelMessageId && c.panelChannelId === channel.id) {
    const existing = await channel.messages.fetch(c.panelMessageId).catch(() => null);
    if (existing) { await existing.edit(payload); return existing; }
  }
  const message = await channel.send(payload);
  await updateGuildSettings(guild.id, old => ({ tickets: { ...old.tickets, panelMessageId: message.id } }));
  return message;
}
const ticketFor = (settings, channel) => settings.tickets?.records?.[channel.id] || (() => {
  const old = parseTopic(channel?.topic);
  return old && { ...old, id: old.caseId, categoryId: 'support', createdAt: channel.createdAt?.toISOString(), ownerId: old.ownerId === 'none' ? null : old.ownerId };
})();
const isStaff = (i, c, category) => Boolean(i.memberPermissions?.has(PermissionFlagsBits.ManageChannels) ||
  i.member?.roles?.cache?.has(category?.roleId || c.teamRoleId) ||
  Array.isArray(i.member?.roles) && i.member.roles.includes(category?.roleId || c.teamRoleId));
async function storeTicket(i, ticket) {
  await updateGuildSettings(i.guildId, old => ({ tickets: { ...old.tickets, records: { ...old.tickets.records, [i.channelId]: ticket } } }));
}
function info(guild, settings, t) {
  return panel(guild, settings, { title: `🎫 Ticket #${t.caseId}`, description: `Status: **${t.state}** · Priorität: **${t.priority || 'normal'}**`,
    fields: [{ name: 'Kategorie', value: t.categoryName || t.categoryId, inline: true },
      { name: 'Ersteller', value: `<@${t.requesterId}>`, inline: true },
      { name: 'Bearbeiter', value: t.ownerId ? `<@${t.ownerId}>` : 'Offen', inline: true },
      { name: 'Eröffnet', value: t.createdAt || 'Unbekannt', inline: true }] });
}
function addActivity(ticket, action, actorId, detail = '') {
  ticket.activity = [...(ticket.activity || []), { action, actorId: actorId || null, detail: String(detail || '').slice(0, 500), at: new Date().toISOString() }].slice(-100);
}
function duration(ticket) {
  const start = Date.parse(ticket.createdAt), end = Date.parse(ticket.closedAt || Date.now());
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 'Nicht verfügbar';
  const minutes = Math.floor((end - start) / 60_000);
  return minutes < 60 ? `${minutes} Min.` : `${Math.floor(minutes / 60)} Std. ${minutes % 60} Min.`;
}
function discordTime(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? `<t:${Math.floor(time / 1000)}:F>` : 'Nicht verfügbar';
}
async function logTicket(guild, title, ticket, actorId, logChannelId, detail = '') {
  const channelId = Object.entries((await getGuildSettings(guild.id)).tickets?.records || {}).find(([, value]) => value.caseId === ticket.caseId)?.[0];
  const fields = [field('Case-ID', `#${ticket.caseId}`, true), field('Kategorie', ticket.categoryName || ticket.categoryId, true),
    field('Ersteller', `<@${ticket.requesterId}>`, true), field('Bearbeiter', ticket.ownerId ? `<@${ticket.ownerId}>` : 'Nicht übernommen', true),
    field('Ticket-Kanal', channelId ? `<#${channelId}>` : 'Kanal nicht mehr verfügbar'),
    field('Status', ticket.state || 'unbekannt', true), field('Priorität', ticket.priority || 'normal', true),
    field('Eröffnet', ticket.createdAt ? `<t:${Math.floor(Date.parse(ticket.createdAt) / 1000)}:F>` : 'Nicht verfügbar', true),
    ...(ticket.closedAt ? [field('Geschlossen', `<t:${Math.floor(Date.parse(ticket.closedAt) / 1000)}:F>`, true)] : []),
    field('Dauer', duration(ticket), true),
    field('Aktion durch', actorId ? `<@${actorId}>` : 'System')];
  if (detail) fields.push(field('Details', detail));
  await sendLog(guild, title, { description: `Ticket #${ticket.caseId} · ${title}`, fields, actorId }, logChannelId || null);
}
async function transcript(channel, t) {
  const messages = []; let before;
  for (let page = 0; page < 20; page++) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (!batch.size) break;
    messages.push(...batch.values()); before = batch.last().id;
    if (batch.size < 100) break;
  }
  messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const text = [`Case: ${t.caseId}`, `Ersteller: ${t.requesterId}`, `Bearbeiter: ${t.ownerId || 'Offen'}`,
    `Kategorie: ${t.categoryName || t.categoryId}`, `Eröffnet: ${t.createdAt}`, `Geschlossen: ${t.closedAt || '-'}`,
    `Dauer: ${t.closedAt && t.createdAt ? duration(t) : '-'}`,
    `Grund: ${t.closeReason || '-'}`,
    'Aktivitäten:', ...(t.activity || []).map(event => `[${event.at}] ${event.action}${event.actorId ? ` · ${event.actorId}` : ''}${event.detail ? ` · ${event.detail}` : ''}`),
    messages.length === 2000 ? 'Hinweis: Ältere Nachrichten abgeschnitten.' : ''].join('\n');
  const messageText = message => [message.content,
    ...message.embeds.flatMap(embed => [embed.title, embed.description, ...(embed.fields || []).map(value => `${value.name}: ${value.value}`)].filter(Boolean)),
    ...[...message.attachments.values()].map(value => `${value.name || 'Anhang'}: ${value.url}`)].filter(Boolean).join('\n') || '[Kein Textinhalt]';
  const lines = messages.map(m => `[${new Date(m.createdTimestamp).toISOString()}] ${m.author?.tag || 'Unbekannt'} (${m.author?.id || '?'}):\n${messageText(m)}`);
  const plain = `${text}\n\n${lines.join('\n')}`;
  const html = `<!doctype html><html lang="de"><meta charset="utf-8"><title>Novora ${escapeHtml(t.caseId)}</title><style>body{background:#1e1f22;color:#ddd;font:16px system-ui;max-width:900px;margin:auto;padding:32px}.msg{border-bottom:1px solid #444;padding:12px}small{color:#aab}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#9db7ff}</style><h1>Ticket ${escapeHtml(t.caseId)}</h1><pre>${escapeHtml(text)}</pre>${messages.map(m => `<div class="msg"><b>${escapeHtml(m.author?.tag || 'Unbekannt')}</b> <small>${new Date(m.createdTimestamp).toISOString()}</small><pre>${escapeHtml(messageText(m))}</pre></div>`).join('')}</html>`;
  const stem = t.caseId.replace(/[^a-zA-Z0-9-]/g, '');
  const textBuffer = Buffer.from(plain);
  const files = [new AttachmentBuilder(textBuffer.subarray(0, 7_000_000), { name: `${stem}.txt` })];
  if (Buffer.byteLength(html) < 7_000_000) files.unshift(new AttachmentBuilder(Buffer.from(html), { name: `${stem}.html` }));
  return files;
}
async function close(i, t, c, settings, reason) {
  t.state = 'closed'; t.closedAt = new Date().toISOString(); t.closeReason = reason || 'Abgeschlossen';
  addActivity(t, 'Ticket geschlossen', i.user.id, t.closeReason);
  await storeTicket(i, t);
  await i.channel.permissionOverwrites.edit(t.requesterId, { SendMessages: false });
  await i.channel.send({ embeds: panel(i.guild, settings, { title: `🔒 Ticket #${t.caseId} geschlossen`, description: 'Dieses Ticket ist geschlossen. Das Team kann es bei Bedarf erneut öffnen.',
    fields: [field('Ersteller', `<@${t.requesterId}>`, true), field('Bearbeiter', t.ownerId ? `<@${t.ownerId}>` : 'Nicht übernommen', true),
      field('Schließungsgrund', t.closeReason), field('Eröffnet', discordTime(t.createdAt), true),
      field('Geschlossen', discordTime(t.closedAt), true), field('Bearbeitungsdauer', duration(t), true)] }), components: [
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket:reopen').setLabel('Erneut öffnen').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ticket:rate').setLabel('Bewerten').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ticket:transcript').setLabel('Transcript').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ticket:delete-request').setLabel('Löschen').setStyle(ButtonStyle.Danger)) ] });
  const files = await transcript(i.channel, t).catch(error => { logger.warn('Transcript fehlgeschlagen', error); return null; });
  const log = await i.guild.channels.fetch(c.logChannelId).catch(() => null);
  if (files && log?.isTextBased()) await log.send({ content: `Ticket #${t.caseId} geschlossen · ${t.categoryName || t.categoryId} · <@${t.requesterId}>`, files, allowedMentions: { parse: [] } }).catch(error => logger.warn('Transcript-Upload fehlgeschlagen', error));
  await logTicket(i.guild, 'Ticket geschlossen', t, i.user.id, c.logChannelId, t.closeReason);
}
async function handleTicketInteraction(i) {
  if (!i.inGuild() || !i.customId?.startsWith('ticket:')) return false;
  const settings = await getGuildSettings(i.guildId), c = settings.tickets || {}, cats = categories(c);
  if (!c.enabled) { await i.reply({ content: 'Tickets sind hier noch nicht aktiv.', ephemeral: true }); return true; }
  if (i.isStringSelectMenu() && i.customId === CATEGORY_ID) {
    const cat = cats.find(v => v.id === i.values[0]);
    if (!cat) { await i.reply({ content: 'Diese Kategorie gibt es nicht mehr.', ephemeral: true }); return true; }
    const count = Object.values(c.records || {}).filter(t => t.requesterId === i.user.id && t.state === 'open' && t.categoryId === cat.id).length;
    if (count >= (cat.maxOpen || c.maxOpen || 1)) { await i.reply({ content: 'Du hast bereits die maximale Anzahl offener Tickets in diesem Bereich.', ephemeral: true }); return true; }
    const newest = Object.values(c.records || {}).filter(t => t.requesterId === i.user.id && t.categoryId === cat.id)
      .reduce((timestamp, t) => Math.max(timestamp, Date.parse(t.createdAt) || 0), 0);
    if (newest && Date.now() - newest < (cat.cooldownSeconds || 0) * 1000) {
      await i.reply({ content: 'Bitte warte vor einem weiteren Ticket in dieser Kategorie.', ephemeral: true }); return true;
    }
    const token = id(); drafts.set(token, { guildId: i.guildId, userId: i.user.id, categoryId: cat.id, answers: {}, expires: Date.now() + 15 * 60_000 });
    await i.showModal(form(cat, 0, token)); return true;
  }
  if (i.isButton() && i.customId.startsWith('ticket:next:')) {
    const token = i.customId.split(':')[2], draft = drafts.get(token), cat = cats.find(v => v.id === draft?.categoryId);
    if (!draft || draft.expires < Date.now() || draft.userId !== i.user.id || draft.guildId !== i.guildId || !cat) {
      await i.reply({ content: 'Das Formular ist abgelaufen. Öffne das Ticket erneut.', ephemeral: true }); return true;
    }
    await i.showModal(form(cat, Math.floor(Object.keys(draft.answers).length / 5), token)); return true;
  }
  if (i.isModalSubmit() && i.customId.startsWith('ticket:form:')) {
    const [, , catId, page, token] = i.customId.split(':'), draft = drafts.get(token), cat = cats.find(v => v.id === catId);
    if (!draft || draft.userId !== i.user.id || draft.guildId !== i.guildId || draft.categoryId !== catId || draft.expires < Date.now() || !cat) {
      await i.reply({ content: 'Das Formular ist abgelaufen.', ephemeral: true }); return true;
    }
    const questions = cat.questions?.length ? cat.questions : [{ id: 'issue', label: 'Anliegen' }];
    for (const q of questions.slice(Number(page) * 5, Number(page) * 5 + 5)) {
      if (q.type === 'file') {
        const files = i.fields.getUploadedFiles(q.id);
        draft.answers[q.id] = [...(files?.values?.() || [])].map(file => ({ name: file.name, url: file.url, size: file.size })).slice(0, q.maxFiles || 3);
      } else draft.answers[q.id] = i.fields.getTextInputValue(q.id);
    }
    if ((Number(page) + 1) * 5 < questions.length) {
      await i.reply({ content: `Schritt ${Number(page) + 1}/${Math.ceil(questions.length / 5)} gespeichert. Weiter mit dem Formular.`, ephemeral: true,
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`ticket:next:${token}`).setLabel('Weiter').setStyle(ButtonStyle.Primary))] }); return true;
    }
    await i.deferReply({ ephemeral: true }); drafts.delete(token);
    const roleId = cat.roleId || c.teamRoleId;
    if (!/^\d{17,20}$/.test(roleId || '')) { await i.editReply('Die Supportrolle ist nicht konfiguriert. Informiere die Serververwaltung.'); return true; }
    const role = await i.guild.roles.fetch(roleId).catch(() => null);
    if (!role) { await i.editReply('Die Supportrolle wurde gelöscht. Informiere die Serververwaltung.'); return true; }
    const existing = Object.values(c.records || {}).filter(t => t.requesterId === i.user.id && t.categoryId === cat.id && t.state === 'open').length;
    if (existing >= (cat.maxOpen || c.maxOpen || 1)) { await i.editReply('Du hast bereits ein offenes Ticket.'); return true; }
    const pingSuppressed = categoryAtCapacity(c, cat);
    const ticket = { caseId: id(), requesterId: i.user.id, categoryId: cat.id, categoryName: cat.name, state: 'open', ownerId: null,
      createdAt: new Date().toISOString(), answers: draft.answers, priority: 'normal', activity: [], pingSuppressed };
    const requestedParent = cat.parentId || c.categoryId;
    const parent = requestedParent && await i.guild.channels.fetch(requestedParent).catch(() => null);
    const ch = await i.guild.channels.create({ name: `${safeName(cat.prefix || cat.id)}-${safeName(i.user.username)}-${ticket.caseId.slice(-4).toLowerCase()}`.slice(0, 90),
      type: ChannelType.GuildText, parent: parent?.type === ChannelType.GuildCategory ? parent.id : undefined,
      topic: `${TOPIC}${i.user.id}:${ticket.caseId}:open:none`, permissionOverwrites: [
        { id: i.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: i.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
        { id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
      ] });
    addActivity(ticket, 'Ticket erstellt', i.user.id, cat.name);
    await updateGuildSettings(i.guildId, old => ({ tickets: { ...old.tickets, records: { ...old.tickets.records, [ch.id]: ticket } } }));
    const extraRoles = (cat.pingRoleIds || []).filter(v => i.guild.roles.cache.has(v)).slice(0, 5);
    const pingRoles = pingSuppressed ? [] : [roleId, ...extraRoles];
    await ch.send({ content: `<@${i.user.id}>${pingRoles.length ? ` ${pingRoles.map(v => `<@&${v}>`).join(' ')}` : ''}`, embeds: panel(i.guild, settings, { title: `${cat.emoji || '🎫'} ${cat.name} · #${ticket.caseId}`,
      description: pingSuppressed ? 'Dein privater Support-Fall ist eröffnet. Die Kategorie ist derzeit ausgelastet; das Support-Team wird nicht zusätzlich markiert.'
        : 'Dein privater Support-Fall ist eröffnet. Ein Teammitglied wird sich um dein Anliegen kümmern.', imageUrl: cat.openImageUrl || cat.imageUrl || c.openImageUrl,
      fields: [field('Ersteller', `<@${i.user.id}>`, true), field('Kategorie', cat.name, true), field('Status', 'Offen', true),
        field('Bearbeiter', 'Noch nicht übernommen', true), field('Eröffnet', discordTime(ticket.createdAt), true),
        ...(Number(cat.capacity) > 0 ? [field('Auslastung', `${openCount(c, cat.id) + 1}/${cat.capacity}${pingSuppressed ? ' · Team-Pings pausiert' : ''}`, true)] : []),
        ...questions.slice(0, 5).map(q => ({ name: q.label, value: formatAnswer(ticket.answers[q.id]) }))] }),
      components: controls(ticket), allowedMentions: { users: [i.user.id], roles: pingRoles } });
    for (let start = 5; start < questions.length; start += 5) {
      await ch.send({ embeds: panel(i.guild, settings, { title: `Weitere Antworten · #${ticket.caseId}`,
        description: `Fragen ${start + 1}–${Math.min(start + 5, questions.length)}`,
        fields: questions.slice(start, start + 5).map(q => ({ name: q.label, value: formatAnswer(ticket.answers[q.id]) })) }),
        allowedMentions: { parse: [] } });
    }
    await i.editReply(`✅ Ticket erstellt: ${ch}`);
    await logTicket(i.guild, 'Ticket erstellt', ticket, i.user.id, cat.logChannelId || c.logChannelId, `Kanal ${ch}`); return true;
  }
  const t = ticketFor(settings, i.channel); if (!t) return false;
  const cat = cats.find(v => v.id === t.categoryId), staff = isStaff(i, c, cat), creator = i.user.id === t.requesterId;
  if (i.isButton() && i.customId === 'ticket:transcript') {
    if (!staff && !creator) { await i.reply({ content: 'Kein Zugriff.', ephemeral: true }); return true; }
    await i.deferReply({ ephemeral: true }); await i.editReply({ content: `Transcript #${t.caseId}`, files: await transcript(i.channel, t) }); return true;
  }
  if (i.isButton() && i.customId === 'ticket:rate') {
    if (!creator || t.state !== 'closed' || t.rating) { await i.reply({ content: 'Diese Bewertung ist nicht verfügbar.', ephemeral: true }); return true; }
    await i.reply({ content: `Wie bewertest du Ticket #${t.caseId}?`, ephemeral: true, components: [new ActionRowBuilder().addComponents(
      [1, 2, 3, 4, 5].map(n => new ButtonBuilder().setCustomId(`ticket:stars:${n}`).setLabel(`${n} ⭐`).setStyle(ButtonStyle.Secondary))) ] }); return true;
  }
  if (i.isButton() && i.customId.startsWith('ticket:stars:')) {
    if (!creator || t.state !== 'closed' || t.rating) { await i.reply({ content: 'Bewertung nicht möglich.', ephemeral: true }); return true; }
    t.rating = Number(i.customId.split(':')[2]); addActivity(t, 'Ticket bewertet', i.user.id, `${t.rating}/5 Sterne`); await storeTicket(i, t);
    await i.update({ content: `Danke für ${t.rating} Sterne!`, components: [] });
    await logTicket(i.guild, 'Ticket-Bewertung', t, i.user.id, c.ratingLogChannelId || c.logChannelId, `${t.rating}/5 Sterne`); return true;
  }
  if (i.isButton() && i.customId === 'ticket:reopen') {
    if (!staff) { await i.reply({ content: 'Nur das Support-Team kann erneut öffnen.', ephemeral: true }); return true; }
    t.state = 'open'; t.closedAt = null; addActivity(t, 'Ticket wieder geöffnet', i.user.id); await storeTicket(i, t);
    await i.channel.permissionOverwrites.edit(t.requesterId, { SendMessages: true }); await i.reply({ content: '🔓 Ticket erneut geöffnet.' });
    await logTicket(i.guild, 'Ticket wieder geöffnet', t, i.user.id, c.logChannelId); return true;
  }
  if (i.isButton() && i.customId === 'ticket:delete-request') {
    if (!staff) { await i.reply({ content: 'Nur das Support-Team kann Tickets löschen.', ephemeral: true }); return true; }
    await i.reply({ content: 'Ticket wirklich dauerhaft löschen? Das Transcript muss vorher im Log gesichert sein.', ephemeral: true,
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket:delete-confirm').setLabel('Dauerhaft löschen').setStyle(ButtonStyle.Danger))] }); return true;
  }
  if (i.isButton() && i.customId === 'ticket:delete-confirm') {
    if (!staff) { await i.reply({ content: 'Nur das Support-Team kann Tickets löschen.', ephemeral: true }); return true; }
    await i.deferUpdate();
    const logId = cat?.logChannelId || c.logChannelId, log = logId && await i.guild.channels.fetch(logId).catch(() => null);
    if (!log?.isTextBased()) { await i.followUp({ content: 'Löschen abgebrochen: Bitte zuerst einen Transcript-Logkanal einrichten.', ephemeral: true }); return true; }
    addActivity(t, 'Ticket endgültig gelöscht', i.user.id);
    await storeTicket(i, t);
    await log.send({ content: `Ticket #${t.caseId} vor Löschung gesichert.`, files: await transcript(i.channel, t), allowedMentions: { parse: [] } });
    await logTicket(i.guild, 'Ticket gelöscht', t, i.user.id, logId);
    await updateGuildSettings(i.guildId, old => { const records = { ...old.tickets.records }; delete records[i.channelId]; return { tickets: { ...old.tickets, records } }; });
    await i.channel.delete('Ticket gelöscht'); return true;
  }
  if (t.state !== 'open') { await i.reply({ content: 'Dieses Ticket ist geschlossen.', ephemeral: true }); return true; }
  if (i.isButton() && i.customId === 'ticket:claim') {
    if (!staff) { await i.reply({ content: 'Nur das Support-Team kann Tickets übernehmen.', ephemeral: true }); return true; }
    if (!canClaim(t, i.user.id)) { await i.reply({ content: 'Du kannst dein eigenes Ticket nicht übernehmen. Das kann nur ein anderes Teammitglied.', ephemeral: true }); return true; }
    if (t.ownerId && t.ownerId !== i.user.id && !i.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) { await i.reply({ content: 'Das Ticket ist bereits übernommen.', ephemeral: true }); return true; }
    const previousOwner = t.ownerId;
    t.ownerId = t.ownerId ? null : i.user.id; t.claimedAt = t.ownerId ? new Date().toISOString() : null;
    if (c.exclusiveClaim && (cat?.roleId || c.teamRoleId)) {
      if (t.ownerId) await i.channel.permissionOverwrites.edit(t.ownerId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
      await i.channel.permissionOverwrites.edit(cat?.roleId || c.teamRoleId, { SendMessages: !t.ownerId });
      if (!t.ownerId && previousOwner && previousOwner !== t.requesterId) await i.channel.permissionOverwrites.delete(previousOwner).catch(() => {});
    }
    addActivity(t, t.ownerId ? 'Ticket übernommen' : 'Ticket freigegeben', i.user.id, t.ownerId ? `Bearbeiter: ${i.user.tag}` : 'Bearbeiter freigegeben');
    await storeTicket(i, t);
    await i.update({ components: controls(t) }); await i.followUp({ content: t.ownerId ? `✅ Übernommen von <@${t.ownerId}>.` : 'Ticket wieder freigegeben.' });
    await logTicket(i.guild, t.ownerId ? 'Ticket übernommen' : 'Ticket freigegeben', t, i.user.id, c.logChannelId); return true;
  }
  if (i.isButton() && i.customId === 'ticket:close-request') {
    if (!creator && !staff) { await i.reply({ content: 'Kein Zugriff.', ephemeral: true }); return true; }
    addActivity(t, 'Schließung angefragt', i.user.id);
    await storeTicket(i, t);
    await logTicket(i.guild, 'Schließung angefragt', t, i.user.id, c.logChannelId);
    await i.reply({ embeds: panel(i.guild, settings, { title: `Schließung für #${t.caseId} angefragt`, description: 'Ein Teammitglied kann die Anfrage bestätigen oder ablehnen.',
      fields: [field('Angefragt von', `<@${i.user.id}>`, true), field('Ticket-Ersteller', `<@${t.requesterId}>`, true),
        field('Kategorie', t.categoryName || t.categoryId, true), field('Zeitpunkt', `<t:${Math.floor(Date.now() / 1000)}:F>`, true)] }), components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket:approve-close').setLabel('Akzeptieren').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ticket:reject-close').setLabel('Ablehnen').setStyle(ButtonStyle.Danger))] }); return true;
  }
  if (i.isButton() && ['ticket:approve-close', 'ticket:reject-close'].includes(i.customId)) {
    if (!staff) { await i.reply({ content: 'Nur das Support-Team entscheidet darüber.', ephemeral: true }); return true; }
    await i.deferUpdate(); await i.message.edit({ components: [] });
    if (i.customId === 'ticket:approve-close') await close(i, t, c, settings, 'Schließungsanfrage angenommen');
    else { addActivity(t, 'Schließungsanfrage abgelehnt', i.user.id); await storeTicket(i, t);
      await i.channel.send('Die Schließungsanfrage wurde abgelehnt.'); await logTicket(i.guild, 'Schließungsanfrage abgelehnt', t, i.user.id, c.logChannelId); }
    return true;
  }
  if (i.isButton() && i.customId === 'ticket:close') {
    if (!staff && !creator) { await i.reply({ content: 'Kein Zugriff.', ephemeral: true }); return true; }
    await i.showModal(new ModalBuilder().setCustomId('ticket:close-form').setTitle('Ticket schließen').addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('reason').setLabel('Grund (optional)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500)))); return true;
  }
  if (i.isModalSubmit() && i.customId === 'ticket:close-form') {
    if (!staff && !creator) { await i.reply({ content: 'Kein Zugriff.', ephemeral: true }); return true; }
    await i.deferReply({ ephemeral: true }); await close(i, t, c, settings, i.fields.getTextInputValue('reason'));
    await i.editReply('Ticket geschlossen.'); return true;
  }
  if (i.isStringSelectMenu() && i.customId === 'ticket:actions') {
    const action = i.values[0];
    if (action === 'info') { await i.reply({ embeds: info(i.guild, settings, t), ephemeral: true }); return true; }
    if (!staff) { await i.reply({ content: 'Nur das Support-Team kann diese Aktion ausführen.', ephemeral: true }); return true; }
    if (action === 'notes') { await i.reply({ content: (t.notes || []).slice(-10).map(v => `[${v.at}] <@${v.authorId}>: ${v.text}`).join('\n').slice(0, 1900) || 'Noch keine Staff-Notizen.',
      ephemeral: true, allowedMentions: { parse: [] } }); return true; }
    if (action === 'ai') {
      await i.deferReply({ ephemeral: true });
      const recent = await i.channel.messages.fetch({ limit: 30 });
      const question = recent.find(m => m.author?.id === t.requesterId && m.content)?.content;
      const context = `Kategorie: ${t.categoryName || t.categoryId}; Formular: ${JSON.stringify(t.answers || {})}`;
      await i.editReply(question ? `🤖 Vorschlag (bitte prüfen): ${await testAnswer(settings, question, context)}` : 'Keine aktuelle Frage des Erstellers gefunden.'); return true;
    }
    if (['add', 'remove'].includes(action)) {
      await i.reply({ content: action === 'add' ? 'Nutzer hinzufügen' : 'Nutzer entfernen', ephemeral: true,
        components: [new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId(`ticket:user:${action}`).setPlaceholder('Nutzer auswählen'))] }); return true;
    }
    if (action === 'category') {
      await i.reply({ content: 'Neue Kategorie wählen', ephemeral: true, components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
        .setCustomId('ticket:change-category').addOptions(cats.slice(0, 25).map(v => ({ label: v.name.slice(0, 100), value: v.id }))))] }); return true;
    }
    if (action === 'priority') {
      await i.reply({ content: 'Priorität wählen', ephemeral: true, components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
        .setCustomId('ticket:priority').addOptions(['niedrig', 'normal', 'hoch', 'kritisch'].map(v => ({ label: v, value: v }))))] }); return true;
    }
    if (action === 'delete') {
      await i.reply({ content: 'Ticket wirklich dauerhaft löschen?', ephemeral: true, components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket:delete-confirm').setLabel('Dauerhaft löschen').setStyle(ButtonStyle.Danger))] }); return true;
    }
    await i.showModal(new ModalBuilder().setCustomId(`ticket:edit:${action}`).setTitle(action === 'note' ? 'Private Staff-Notiz' : 'Ticket umbenennen').addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('value').setLabel(action === 'note' ? 'Notiz' : 'Neuer Name').setRequired(true)
        .setStyle(action === 'note' ? TextInputStyle.Paragraph : TextInputStyle.Short).setMaxLength(action === 'note' ? 1000 : 80)))); return true;
  }
  if (!staff) { await i.reply({ content: 'Nur das Support-Team kann diese Aktion ausführen.', ephemeral: true }); return true; }
  if (i.isUserSelectMenu() && i.customId.startsWith('ticket:user:')) {
    const userId = i.values[0], add = i.customId.endsWith(':add');
    if (!add && userId === t.requesterId) { await i.reply({ content: 'Der Ersteller kann nicht entfernt werden.', ephemeral: true }); return true; }
    await i.channel.permissionOverwrites.edit(userId, { ViewChannel: add, SendMessages: add, ReadMessageHistory: add });
    addActivity(t, add ? 'Nutzer hinzugefügt' : 'Nutzer entfernt', i.user.id, `Betroffene Person: ${userId}`);
    await storeTicket(i, t);
    await i.update({ content: add ? 'Nutzer hinzugefügt.' : 'Nutzer entfernt.', components: [] });
    await logTicket(i.guild, add ? 'Nutzer zum Ticket hinzugefügt' : 'Nutzer aus Ticket entfernt', t, i.user.id, c.logChannelId, `Betroffene Person: <@${userId}>`); return true;
  }
  if (i.isStringSelectMenu() && i.customId === 'ticket:priority') {
    const previous = t.priority || 'normal'; t.priority = i.values[0]; addActivity(t, 'Priorität geändert', i.user.id, `${previous} → ${t.priority}`);
    await storeTicket(i, t); await i.update({ content: `Priorität: ${t.priority}`, components: [] });
    await logTicket(i.guild, 'Ticket-Priorität geändert', t, i.user.id, c.logChannelId, `${previous} → ${t.priority}`); return true;
  }
  if (i.isStringSelectMenu() && i.customId === 'ticket:change-category') {
    const next = cats.find(v => v.id === i.values[0]); if (!next) return true;
    const previousName = t.categoryName || t.categoryId;
    const oldRole = cat?.roleId || c.teamRoleId, newRole = next.roleId || c.teamRoleId;
    if (oldRole !== newRole) { await i.channel.permissionOverwrites.edit(newRole, { ViewChannel: true, SendMessages: !c.exclusiveClaim || !t.ownerId, ReadMessageHistory: true });
      if (oldRole) await i.channel.permissionOverwrites.delete(oldRole).catch(() => {}); }
    const parentId = next.parentId || c.categoryId, parent = parentId && await i.guild.channels.fetch(parentId).catch(() => null);
    if (parent?.type === ChannelType.GuildCategory) await i.channel.setParent(parent.id, { lockPermissions: false });
    t.categoryId = next.id; t.categoryName = next.name; addActivity(t, 'Kategorie geändert', i.user.id, `${previousName} → ${next.name}`); await storeTicket(i, t);
    await i.update({ content: `Kategorie: ${next.name}`, components: [] });
    await logTicket(i.guild, 'Ticket-Kategorie geändert', t, i.user.id, next.logChannelId || c.logChannelId, `${previousName} → ${next.name}`); return true;
  }
  if (i.isModalSubmit() && i.customId.startsWith('ticket:edit:')) {
    const value = i.fields.getTextInputValue('value');
    if (i.customId.endsWith(':rename')) {
      const name = safeName(value); if (!name) { await i.reply({ content: 'Der Kanalname braucht Buchstaben oder Zahlen.', ephemeral: true }); return true; }
      const previousName = i.channel.name;
      await i.channel.setName(name);
      addActivity(t, 'Ticket umbenannt', i.user.id, `${previousName} → ${name}`);
      await storeTicket(i, t);
      await logTicket(i.guild, 'Ticket umbenannt', t, i.user.id, c.logChannelId, `${previousName} → ${name}`);
    }
    else { t.notes = [...(t.notes || []), { authorId: i.user.id, text: value, at: new Date().toISOString() }];
      addActivity(t, 'Private Staff-Notiz gespeichert', i.user.id); await storeTicket(i, t);
      await logTicket(i.guild, 'Staff-Notiz gespeichert', t, i.user.id, c.logChannelId, 'Der vertrauliche Inhalt wird nicht im Log wiederholt.'); }
    await i.reply({ content: 'Gespeichert.', ephemeral: true }); return true;
  }
  return false;
}
module.exports = { sendTicketPanel, panelPayload, handleTicketInteraction, parseTopic, DEFAULT_CATEGORIES, form, transcript, categories,
  openCount, categoryAtCapacity, canClaim, formatAnswer };
