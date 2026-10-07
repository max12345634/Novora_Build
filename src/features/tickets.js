const { randomBytes } = require('node:crypto');
const { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder,
  ModalBuilder, PermissionFlagsBits, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
  UserSelectMenuBuilder, RoleSelectMenuBuilder } = require('discord.js');
const { getGuildSettings, updateGuildSettings } = require('../utils/guildSettings');
const { panel } = require('../utils/theme');
const { sendLog } = require('../utils/auditLog');
const { suggest } = require('./presets');
const { logger } = require('../utils/logger');
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
    { label: 'Staff-Notiz', value: 'note', emoji: '🗒️' }, { label: 'KI-Antwort vorschlagen', value: 'ai', emoji: '🤖' },
    { label: 'Ticket löschen', value: 'delete', emoji: '🗑️' }
  ))];
}
function form(category, page = 0, token = '') {
  const questions = (category.questions?.length ? category.questions : [{ id: 'issue', label: 'Wobei brauchst du Hilfe?', style: 'paragraph' }]);
  return new ModalBuilder().setCustomId(`ticket:form:${category.id}:${page}:${token}`).setTitle(`Ticket: ${category.name}`.slice(0, 45)).addComponents(
    questions.slice(page * 5, page * 5 + 5).map((q) => new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId(q.id).setLabel(q.label.slice(0, 45))
        .setStyle(q.style === 'short' ? TextInputStyle.Short : TextInputStyle.Paragraph)
        .setRequired(q.required !== false).setMaxLength(Math.min(q.maxLength || 1000, 4000))
    ))
  );
}
function panelPayload(guild, settings) {
  const c = settings.tickets || {};
  const choices = categories(c).slice(0, 25);
  if (!choices.length) throw new Error('Mindestens eine aktive Ticket-Kategorie fehlt.');
  return { embeds: panel(guild, settings, { title: c.panelTitle || `🎫 ${settings.branding?.projectName || guild.name} · Support`,
    description: c.panelDescription || 'Wähle unten den passenden Bereich. Danach kannst du dein Anliegen in einem privaten Formular beschreiben.', imageUrl: c.panelImageUrl,
    footerImageUrl: c.footerImageUrl }), components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
      .setCustomId(CATEGORY_ID).setPlaceholder('Wähle dein Anliegen …').addOptions(choices.map(v => ({
        label: v.name.slice(0, 100), value: v.id, description: String(v.description || v.name).slice(0, 100), emoji: v.emoji || undefined
      }))))], allowedMentions: { parse: [] } };
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
  i.member?.roles?.cache?.has(category?.roleId || c.teamRoleId));
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
    `Dauer: ${t.closedAt && t.createdAt ? Math.round((Date.parse(t.closedAt)-Date.parse(t.createdAt))/60000) + ' Minuten' : '-'}`,
    `Grund: ${t.closeReason || '-'}`, messages.length === 2000 ? 'Hinweis: Ältere Nachrichten abgeschnitten.' : ''].join('\n');
  const lines = messages.map(m => `[${new Date(m.createdTimestamp).toISOString()}] ${m.author?.tag || 'Unbekannt'} (${m.author?.id || '?'}): ${m.content || '[Embed/Anhang]'} ${[...m.attachments.values()].map(a => a.url).join(' ')}`);
  const plain = `${text}\n\n${lines.join('\n')}`;
  const html = `<!doctype html><html lang="de"><meta charset="utf-8"><title>Novora ${escapeHtml(t.caseId)}</title><style>body{background:#1e1f22;color:#ddd;font:16px system-ui;max-width:900px;margin:auto;padding:32px}.msg{border-bottom:1px solid #444;padding:12px}small{color:#aab}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>Ticket ${escapeHtml(t.caseId)}</h1><pre>${escapeHtml(text)}</pre>${messages.map(m => `<div class="msg"><b>${escapeHtml(m.author?.tag || 'Unbekannt')}</b> <small>${new Date(m.createdTimestamp).toISOString()}</small><pre>${escapeHtml(m.content || '')}</pre>${[...m.attachments.values()].map(a => `<a rel="noreferrer" href="${escapeHtml(a.url)}">${escapeHtml(a.name || 'Anhang')}</a>`).join(' ')}</div>`).join('')}</html>`;
  const stem = t.caseId.replace(/[^a-zA-Z0-9-]/g, '');
  const files = [new AttachmentBuilder(Buffer.from(plain.slice(0, 6_000_000)), { name: `${stem}.txt` })];
  if (Buffer.byteLength(html) < 7_000_000) files.unshift(new AttachmentBuilder(Buffer.from(html), { name: `${stem}.html` }));
  return files;
}
async function close(i, t, c, settings, reason) {
  t.state = 'closed'; t.closedAt = new Date().toISOString(); t.closeReason = reason || 'Abgeschlossen';
  await storeTicket(i, t);
  await i.channel.permissionOverwrites.edit(t.requesterId, { SendMessages: false });
  await i.channel.send({ embeds: panel(i.guild, settings, { title: '🔒 Ticket geschlossen', description: `Case #${t.caseId}\nGrund: ${t.closeReason}` }), components: [
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket:reopen').setLabel('Erneut öffnen').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ticket:rate').setLabel('Bewerten').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ticket:transcript').setLabel('Transcript').setStyle(ButtonStyle.Secondary)) ] });
  const files = await transcript(i.channel, t).catch(error => { logger.warn('Transcript fehlgeschlagen', error); return null; });
  const log = await i.guild.channels.fetch(c.logChannelId).catch(() => null);
  if (files && log?.isTextBased()) await log.send({ content: `Ticket #${t.caseId} geschlossen · ${t.categoryName || t.categoryId} · <@${t.requesterId}>`, files, allowedMentions: { parse: [] } }).catch(error => logger.warn('Transcript-Upload fehlgeschlagen', error));
  await sendLog(i.guild, 'Ticket geschlossen', `Case #${t.caseId} · Grund: ${t.closeReason}`, c.logChannelId);
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
    for (const q of questions.slice(Number(page) * 5, Number(page) * 5 + 5)) draft.answers[q.id] = i.fields.getTextInputValue(q.id);
    if ((Number(page) + 1) * 5 < questions.length) {
      await i.reply({ content: `Schritt ${Number(page) + 1}/${Math.ceil(questions.length / 5)} gespeichert. Weiter mit dem Formular.`, ephemeral: true,
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`ticket:next:${token}`).setLabel('Weiter').setStyle(ButtonStyle.Primary))] }); return true;
    }
    await i.deferReply({ ephemeral: true }); drafts.delete(token);
    const roleId = cat.roleId || c.teamRoleId;
    const role = await i.guild.roles.fetch(roleId).catch(() => null);
    if (!role) { await i.editReply('Die Supportrolle wurde gelöscht. Informiere die Serververwaltung.'); return true; }
    const existing = Object.values(c.records || {}).filter(t => t.requesterId === i.user.id && t.categoryId === cat.id && t.state === 'open').length;
    if (existing >= (cat.maxOpen || c.maxOpen || 1)) { await i.editReply('Du hast bereits ein offenes Ticket.'); return true; }
    const ticket = { caseId: id(), requesterId: i.user.id, categoryId: cat.id, categoryName: cat.name, state: 'open', ownerId: null,
      createdAt: new Date().toISOString(), answers: draft.answers, priority: 'normal' };
    const ch = await i.guild.channels.create({ name: `${safeName(cat.prefix || cat.id)}-${safeName(i.user.username)}-${ticket.caseId.slice(-4).toLowerCase()}`.slice(0, 90),
      type: ChannelType.GuildText, parent: cat.parentId || c.categoryId || undefined,
      topic: `${TOPIC}${i.user.id}:${ticket.caseId}:open:none`, permissionOverwrites: [
        { id: i.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: i.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
        { id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
      ] });
    await updateGuildSettings(i.guildId, old => ({ tickets: { ...old.tickets, records: { ...old.tickets.records, [ch.id]: ticket } } }));
    await ch.send({ content: `<@${i.user.id}> <@&${roleId}>`, embeds: panel(i.guild, settings, { title: `🎫 ${cat.name} · #${ticket.caseId}`,
      description: 'Ein Teammitglied wird sich um dein Anliegen kümmern.', imageUrl: cat.openImageUrl || c.openImageUrl,
      fields: questions.slice(0, 20).map(q => ({ name: q.label, value: (ticket.answers[q.id] || '—').slice(0, 1024) })) }),
      components: controls(ticket), allowedMentions: { users: [i.user.id], roles: [roleId] } });
    await i.editReply(`✅ Ticket erstellt: ${ch}`);
    await sendLog(i.guild, 'Ticket erstellt', `Case #${ticket.caseId} · ${ch} · ${cat.name}`, cat.logChannelId || c.logChannelId); return true;
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
    t.rating = Number(i.customId.split(':')[2]); await storeTicket(i, t);
    await i.update({ content: `Danke für ${t.rating} Sterne!`, components: [] });
    await sendLog(i.guild, 'Ticket-Bewertung', `#${t.caseId} · ${t.categoryName || t.categoryId} · ${t.rating}/5 · Ersteller <@${t.requesterId}> · Bearbeiter ${t.ownerId ? `<@${t.ownerId}>` : '—'} · ${new Date().toISOString()}`, c.ratingLogChannelId); return true;
  }
  if (i.isButton() && i.customId === 'ticket:reopen') {
    if (!staff) { await i.reply({ content: 'Nur das Support-Team kann erneut öffnen.', ephemeral: true }); return true; }
    t.state = 'open'; t.closedAt = null; await storeTicket(i, t);
    await i.channel.permissionOverwrites.edit(t.requesterId, { SendMessages: true }); await i.reply({ content: '🔓 Ticket erneut geöffnet.' }); return true;
  }
  if (t.state !== 'open') { await i.reply({ content: 'Dieses Ticket ist geschlossen.', ephemeral: true }); return true; }
  if (i.isButton() && i.customId === 'ticket:claim') {
    if (!staff) { await i.reply({ content: 'Nur das Support-Team kann Tickets übernehmen.', ephemeral: true }); return true; }
    if (t.ownerId && t.ownerId !== i.user.id && !i.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) { await i.reply({ content: 'Das Ticket ist bereits übernommen.', ephemeral: true }); return true; }
    t.ownerId = t.ownerId ? null : i.user.id; t.claimedAt = t.ownerId ? new Date().toISOString() : null; await storeTicket(i, t);
    if (c.exclusiveClaim && cat?.roleId) await i.channel.permissionOverwrites.edit(cat.roleId, { SendMessages: !t.ownerId });
    await i.update({ components: controls(t) }); await i.followUp({ content: t.ownerId ? `✅ Übernommen von <@${t.ownerId}>.` : 'Ticket wieder freigegeben.' });
    await sendLog(i.guild, 'Ticket-Übernahme', `#${t.caseId} · ${t.ownerId || 'freigegeben'} · ${t.claimedAt || new Date().toISOString()}`, c.logChannelId); return true;
  }
  if (i.isButton() && i.customId === 'ticket:close-request') {
    if (!creator && !staff) { await i.reply({ content: 'Kein Zugriff.', ephemeral: true }); return true; }
    await i.reply({ embeds: panel(i.guild, settings, { title: 'Schließung angefragt', description: `<@${i.user.id}> möchte #${t.caseId} schließen.` }), components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket:approve-close').setLabel('Akzeptieren').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ticket:reject-close').setLabel('Ablehnen').setStyle(ButtonStyle.Danger))] }); return true;
  }
  if (i.isButton() && ['ticket:approve-close', 'ticket:reject-close'].includes(i.customId)) {
    if (!staff) { await i.reply({ content: 'Nur das Support-Team entscheidet darüber.', ephemeral: true }); return true; }
    await i.deferUpdate(); await i.message.edit({ components: [] });
    if (i.customId === 'ticket:approve-close') await close(i, t, c, settings, 'Schließungsanfrage angenommen');
    else await i.channel.send('Die Schließungsanfrage wurde abgelehnt.'); return true;
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
    await i.update({ content: add ? 'Nutzer hinzugefügt.' : 'Nutzer entfernt.', components: [] }); return true;
  }
  if (i.isStringSelectMenu() && i.customId === 'ticket:priority') {
    t.priority = i.values[0]; await storeTicket(i, t); await i.update({ content: `Priorität: ${t.priority}`, components: [] }); return true;
  }
  if (i.isStringSelectMenu() && i.customId === 'ticket:change-category') {
    const next = cats.find(v => v.id === i.values[0]); if (!next) return true;
    const oldRole = cat?.roleId || c.teamRoleId, newRole = next.roleId || c.teamRoleId;
    if (oldRole !== newRole) { await i.channel.permissionOverwrites.delete(oldRole).catch(() => {}); await i.channel.permissionOverwrites.edit(newRole, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }); }
    if (next.parentId || c.categoryId) await i.channel.setParent(next.parentId || c.categoryId, { lockPermissions: false });
    t.categoryId = next.id; t.categoryName = next.name; await storeTicket(i, t);
    await i.update({ content: `Kategorie: ${next.name}`, components: [] }); return true;
  }
  if (i.isModalSubmit() && i.customId.startsWith('ticket:edit:')) {
    const value = i.fields.getTextInputValue('value');
    if (i.customId.endsWith(':rename')) await i.channel.setName(safeName(value));
    else { t.notes = [...(t.notes || []), { authorId: i.user.id, text: value, at: new Date().toISOString() }]; await storeTicket(i, t); }
    await i.reply({ content: 'Gespeichert.', ephemeral: true }); return true;
  }
  if (i.isButton() && i.customId === 'ticket:delete-confirm') {
    await i.deferUpdate(); await sendLog(i.guild, 'Ticket gelöscht', `#${t.caseId} · von <@${i.user.id}>`, c.logChannelId);
    await updateGuildSettings(i.guildId, old => { const records = { ...old.tickets.records }; delete records[i.channelId]; return { tickets: { ...old.tickets, records } }; });
    await i.channel.delete('Ticket gelöscht'); return true;
  }
  return false;
}
module.exports = { sendTicketPanel, panelPayload, handleTicketInteraction, parseTopic, DEFAULT_CATEGORIES, form, transcript, categories };
