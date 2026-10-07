const { randomBytes } = require('node:crypto');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, ModalBuilder,
  PermissionFlagsBits, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { getGuildSettings, updateGuildSettings } = require('../utils/guildSettings');
const { panel } = require('../utils/theme');
const { sendLog } = require('../utils/auditLog');
const drafts = new Map();
const fallbackType = { id: 'team', name: 'Team', emoji: '📝', enabled: true, questions: [
  { id: 'age', label: 'Wie alt bist du?', style: 'short' }, { id: 'experience', label: 'Welche Erfahrungen hast du?' },
  { id: 'why', label: 'Warum möchtest du dich bewerben?' }, { id: 'time', label: 'Wie viel Zeit hast du?', style: 'short' },
  { id: 'more', label: 'Weitere Informationen', required: false }] };
const types = (c) => (Array.isArray(c.types) ? c.types : [fallbackType]).filter(v => v.enabled !== false);
function applicationPanel(guild, s) {
  return panel(guild, s, { title: s.applications?.panelTitle || `📝 Bewerbungen · ${s.branding?.projectName || guild.name}`,
    description: s.applications?.panelDescription || 'Wähle den Bereich aus, für den du dich bewerben möchtest.', imageUrl: s.applications?.panelImageUrl,
    thumbnailUrl: s.applications?.thumbnailUrl, footerText: s.applications?.footerText, footerImageUrl: s.applications?.footerImageUrl,
    color: s.applications?.color });
}
async function sendApplicationPanel(channel, guild) {
  const s = await getGuildSettings(guild.id), c = s.applications, options = types(c).slice(0, 25).map(v => ({ label: v.name.slice(0, 100), value: v.id, emoji: v.emoji || '📝' }));
  if (!options.length) throw new Error('Mindestens ein Bewerbungstyp fehlt.');
  const payload = { embeds: applicationPanel(guild, s), components: [new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('application:select').setPlaceholder('Bewerbung auswählen').addOptions(options))], allowedMentions: { parse: [] } };
  const old = c.panelMessageId && await channel.messages.fetch(c.panelMessageId).catch(() => null);
  const msg = old ? await old.edit(payload) : await channel.send(payload);
  await updateGuildSettings(guild.id, oldSettings => ({ applications: { ...oldSettings.applications, panelMessageId: msg.id } }));
  return msg;
}
function modal(type = fallbackType, page = 0, token = '') {
  const questions = type.questions?.length ? type.questions : [{ id: 'motivation', label: 'Warum möchtest du dich bewerben?' }];
  return new ModalBuilder().setCustomId(`application:form:${type.id}:${page}:${token}`).setTitle(type.name.slice(0, 45)).addComponents(questions.slice(page * 5, page * 5 + 5).map(q =>
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(q.id).setLabel(q.label.slice(0, 45))
      .setStyle(q.style === 'short' ? TextInputStyle.Short : TextInputStyle.Paragraph).setMaxLength(1000).setRequired(q.required !== false))));
}
async function handleApplicationInteraction(i) {
  if (!i.inGuild() || !i.customId?.startsWith('application:')) return false;
  const s = await getGuildSettings(i.guildId), c = s.applications || {};
  if (!c.enabled) { await i.reply({ content: 'Bewerbungen sind nicht aktiv.', ephemeral: true }); return true; }
  const action = i.customId.split(':');
  if (i.isStringSelectMenu() && action[1] === 'select' || i.isButton() && i.customId === 'application:open') {
    const type = types(c).find(v => v.id === i.values?.[0]) || types(c)[0];
    if (!type) { await i.reply({ content: 'Kein Bewerbungstyp verfügbar.', ephemeral: true }); return true; }
    const token = randomBytes(5).toString('hex'); drafts.set(token, { userId: i.user.id, guildId: i.guildId, typeId: type.id, answers: {}, expires: Date.now() + 900000 });
    await i.showModal(modal(type, 0, token)); return true;
  }
  if (i.isButton() && action[1] === 'next') {
    const d = drafts.get(action[2]), type = types(c).find(v => v.id === d?.typeId);
    if (!d || d.userId !== i.user.id || d.guildId !== i.guildId || d.expires < Date.now() || !type) { await i.reply({ content: 'Formular abgelaufen.', ephemeral: true }); return true; }
    await i.showModal(modal(type, Math.floor(Object.keys(d.answers).length / 5), action[2])); return true;
  }
  if (i.isModalSubmit() && action[1] === 'form') {
    const [, , typeId, page, token] = action, d = drafts.get(token), type = types(c).find(v => v.id === typeId);
    if (!d || d.userId !== i.user.id || d.guildId !== i.guildId || d.typeId !== typeId || d.expires < Date.now() || !type) { await i.reply({ content: 'Formular abgelaufen.', ephemeral: true }); return true; }
    const questions = type.questions?.length ? type.questions : [{ id: 'motivation', label: 'Motivation' }];
    for (const q of questions.slice(Number(page) * 5, Number(page) * 5 + 5)) d.answers[q.id] = i.fields.getTextInputValue(q.id);
    if ((Number(page) + 1) * 5 < questions.length) { await i.reply({ content: 'Weiter mit dem nächsten Formular.', ephemeral: true,
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`application:next:${token}`).setLabel('Weiter').setStyle(ButtonStyle.Primary))] }); return true; }
    await i.deferReply({ ephemeral: true }); drafts.delete(token);
    const roleId = type.roleId || c.teamRoleId;
    if (!/^\d{17,20}$/.test(roleId || '') || !await i.guild.roles.fetch(roleId).catch(() => null)) { await i.editReply('Die zuständige Rolle fehlt.'); return true; }
    if (Object.values(c.records || {}).some(v => v.userId === i.user.id && v.typeId === type.id && v.state === 'open')) { await i.editReply('Du hast bereits eine offene Bewerbung dieses Typs.'); return true; }
    const requestedParent = type.parentId || c.categoryId, parent = requestedParent && await i.guild.channels.fetch(requestedParent).catch(() => null);
    const ch = await i.guild.channels.create({ name: `bewerbung-${type.id}-${i.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 90),
      type: ChannelType.GuildText, parent: parent?.type === ChannelType.GuildCategory ? parent.id : undefined,
      topic: `novora-application:${i.user.id}:${type.id}`, permissionOverwrites: [
        { id: i.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: i.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
        { id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] } ] });
    const record = { userId: i.user.id, typeId: type.id, state: 'open', createdAt: new Date().toISOString(), answers: d.answers };
    await updateGuildSettings(i.guildId, old => ({ applications: { ...old.applications, records: { ...old.applications.records, [ch.id]: record } } }));
    await ch.send({ content: `<@${i.user.id}> <@&${roleId}>`, embeds: panel(i.guild, s, { title: `📝 ${type.name}`, description: `Bewerbung von <@${i.user.id}>`, imageUrl: type.imageUrl,
      fields: questions.slice(0, 5).map(q => ({ name: q.label, value: (d.answers[q.id] || '—').slice(0, 700) })) }),
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('application:accept').setLabel('Annehmen').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('application:reject').setLabel('Ablehnen').setStyle(ButtonStyle.Danger))],
      allowedMentions: { users: [i.user.id], roles: [roleId] } });
    for (let start = 5; start < questions.length; start += 5) await ch.send({ embeds: panel(i.guild, s, {
      title: `Weitere Antworten · ${type.name}`, description: `Fragen ${start + 1}–${Math.min(start + 5, questions.length)}`,
      fields: questions.slice(start, start + 5).map(q => ({ name: q.label, value: (d.answers[q.id] || '—').slice(0, 700) })) }), allowedMentions: { parse: [] } });
    await i.editReply(`✅ Bewerbung erstellt: ${ch}`); await sendLog(i.guild, 'Bewerbung erstellt', `${type.name} · ${ch} · <@${i.user.id}>`, type.logChannelId || c.logChannelId); return true;
  }
  if (i.isButton() && ['application:accept', 'application:reject'].includes(i.customId)) {
    const record = c.records?.[i.channelId], type = types(c).find(v => v.id === record?.typeId) || fallbackType;
    if (!i.memberPermissions?.has(PermissionFlagsBits.ManageChannels) && !i.member?.roles?.cache?.has(type.roleId || c.teamRoleId) &&
      !(Array.isArray(i.member?.roles) && i.member.roles.includes(type.roleId || c.teamRoleId))) {
      await i.reply({ content: 'Nur das Bewerbungs-Team kann entscheiden.', ephemeral: true }); return true; }
    if (!record || record.state !== 'open') { await i.reply({ content: 'Diese Bewerbung wurde bereits entschieden.', ephemeral: true }); return true; }
    await i.deferUpdate(); const accepted = i.customId.endsWith('accept');
    await updateGuildSettings(i.guildId, old => ({ applications: { ...old.applications, records: { ...old.applications.records,
      [i.channelId]: { ...record, state: accepted ? 'accepted' : 'rejected', decidedAt: new Date().toISOString(), decidedBy: i.user.id } } } }));
    await i.message.edit({ components: [] }); await i.channel.send({ embeds: panel(i.guild, s, { title: accepted ? '✅ Bewerbung angenommen' : '❌ Bewerbung abgelehnt', description: `Entscheidung von <@${i.user.id}>.` }) });
    await sendLog(i.guild, 'Bewerbung entschieden', `${type.name} · ${record.userId} · ${accepted ? 'Angenommen' : 'Abgelehnt'} · <@${i.user.id}>`, type.logChannelId || c.logChannelId); return true;
  }
  return false;
}
module.exports = { handleApplicationInteraction, modal, applicationPanel, sendApplicationPanel, types };
