const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, ModalBuilder,
  PermissionFlagsBits, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');
const { getGuildSettings } = require('../utils/guildSettings');
const { sendLog } = require('../utils/auditLog');
const fs = require('node:fs/promises');
const path = require('node:path');

const PANEL_ID = 'ticket:category';
const MODAL_PREFIX = 'ticket:form:';
const TOPIC_PREFIX = 'novora-ticket:';
const DEFAULT_CATEGORIES = {
  general: { emoji: '🆘', label: 'Allgemeiner Support', description: 'Allgemeine Fragen oder Probleme rund um den Server.' },
  rules: { emoji: '📖', label: 'Regel- & RP-Fragen', description: 'Fragen zu Regeln, Roleplay oder Abläufen.' },
  report: { emoji: '🚨', label: 'Spieler melden', description: 'Melde Regelverstöße oder auffälliges Verhalten.' },
  technical: { emoji: '⚙️', label: 'Technischer Support', description: 'Probleme mit Bots, Rollen oder Verifizierung.' },
  team: { emoji: '👥', label: 'Team-Beschwerde', description: 'Melde vertraulich ein Problem mit einem Teammitglied.' }
};
function caseId() { return 'T-' + Math.random().toString(36).slice(2, 10).toUpperCase(); }
function safeName(value) { return String(value || 'user').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 40); }
function parseTopic(topic = '') {
  if (!topic.startsWith(TOPIC_PREFIX)) return null;
  const [requesterId, id, state, ownerId] = topic.slice(TOPIC_PREFIX.length).split(':');
  if (!/^\d{17,20}$/.test(requesterId)) return null;
  return { requesterId, caseId: id, state: state || 'open', ownerId: ownerId || 'none' };
}
function topicFor(ticket) { return TOPIC_PREFIX + [ticket.requesterId, ticket.caseId, ticket.state || 'open', ticket.ownerId || 'none'].join(':'); }
function categories(config) { return config.categories && Object.keys(config.categories).length ? config.categories : DEFAULT_CATEGORIES; }
function controls(claimed = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:close').setLabel('Schließen').setEmoji('❌').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ticket:claim').setLabel(claimed ? 'Übernommen' : 'Übernehmen').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(claimed),
    new ButtonBuilder().setCustomId('ticket:close-request').setLabel('Schließungs-Anfrage').setEmoji('❓').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ticket:transcript').setLabel('Transcript').setEmoji('📄').setStyle(ButtonStyle.Secondary)
  );
}
async function sendTicketPanel(channel, guild) {
  const config = (await getGuildSettings(guild.id)).tickets || {};
  const options = Object.entries(categories(config)).slice(0, 25).map(([value, item]) => ({
    label: item.label.slice(0, 100), value, description: item.description.slice(0, 100), emoji: item.emoji
  }));
  await channel.send({
    embeds: [new EmbedBuilder().setColor(0x3f4298).setTitle('🎫 ' + guild.name + ' | Support')
      .setDescription('Du benötigst Hilfe, hast eine Frage oder möchtest etwas melden? Wähle unten die passende Kategorie für dein Anliegen aus. Anschließend öffnet sich ein kurzes Formular und dein privates Ticket wird erstellt.')
      .setFooter({ text: guild.name + ' · Support' })],
    components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(PANEL_ID).setPlaceholder('Wähle eine Kategorie …').addOptions(options))],
    allowedMentions: { parse: [] }
  });
}
function ticketModal(key) {
  return new ModalBuilder().setCustomId(MODAL_PREFIX + key).setTitle('Erstelle ein Ticket').addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('topic').setLabel('Thema')
      .setPlaceholder('z. B. Frage zum Server').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500))
  );
}
function isTeam(interaction, config) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels) || Boolean(interaction.member?.roles?.cache?.has(config.teamRoleId));
}
async function handleTicketInteraction(interaction) {
  if (!interaction.inGuild() || !interaction.customId?.startsWith('ticket:')) return false;
  const config = (await getGuildSettings(interaction.guildId)).tickets || {};
  if (!config.enabled) {
    await interaction.reply({ content: 'Das Ticket-System ist auf diesem Server nicht aktiv.', ephemeral: true });
    return true;
  }
  if (interaction.isStringSelectMenu() && interaction.customId === PANEL_ID) {
    const key = interaction.values[0];
    const item = categories(config)[key];
    if (!item) return false;
    const existing = interaction.guild.channels.cache.find((c) => {
      const parsed = parseTopic(c.topic);
      return parsed?.requesterId === interaction.user.id && parsed.state === 'open';
    });
    if (existing) {
      await interaction.reply({ content: 'Du hast bereits ein offenes Ticket: ' + existing.toString(), ephemeral: true });
      return true;
    }
    await interaction.showModal(ticketModal(key));
    return true;
  }
  if (interaction.isModalSubmit() && interaction.customId.startsWith(MODAL_PREFIX)) {
    const key = interaction.customId.slice(MODAL_PREFIX.length);
    const item = categories(config)[key];
    if (!item) return false;
    await interaction.deferReply({ ephemeral: true });
    const id = caseId();
    const ticket = { requesterId: interaction.user.id, caseId: id, state: 'open', ownerId: 'none' };
    const channel = await interaction.guild.channels.create({
      name: 'support-' + safeName(interaction.user.username) + '-' + id.slice(-4).toLowerCase(),
      type: ChannelType.GuildText,
      parent: config.categoryId && interaction.guild.channels.cache.has(config.categoryId) ? config.categoryId : undefined,
      topic: topicFor(ticket),
      permissionOverwrites: [
        { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
        { id: config.teamRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
      ]
    });
    const topic = interaction.fields.getTextInputValue('topic');
    await channel.send({
      content: '<@' + interaction.user.id + '> <@&' + config.teamRoleId + '>',
      embeds: [new EmbedBuilder().setColor(0xf0b232).setTitle('🎫 Willkommen im ' + interaction.guild.name + ' Support')
        .setDescription('Vielen Dank, dass du ein Ticket erstellt hast. Ein zuständiges Teammitglied wird sich so schnell wie möglich um dein Anliegen kümmern.\n\n**Thema**\n' + topic.slice(0, 1500))
        .addFields(
          { name: '📚 CaseID', value: '#' + id, inline: true },
          { name: '🏷️ Kategorie', value: item.label, inline: true },
          { name: '👤 Ersteller', value: '<@' + interaction.user.id + '>', inline: true }
        ).setFooter({ text: interaction.guild.name + ' · Support' })],
      components: [controls(false)],
      allowedMentions: { users: [interaction.user.id], roles: [config.teamRoleId] }
    });
    await interaction.editReply({ content: '✅ Das Ticket wurde erstellt: ' + channel.toString() });
    await sendLog(interaction.guild, 'Ticket erstellt', 'Case: #' + id + '\nTicket: <#' + channel.id + '>\nErsteller: <@' + interaction.user.id + '>\nKategorie: ' + item.label, config.logChannelId);
    return true;
  }
  if (!interaction.isButton()) return false;
  const ticket = parseTopic(interaction.channel?.topic);
  if (!ticket) return false;
  if (interaction.customId === 'ticket:claim') {
    if (!isTeam(interaction, config)) {
      await interaction.reply({ content: 'Nur das Support-Team kann Tickets übernehmen.', ephemeral: true });
      return true;
    }
    ticket.ownerId = interaction.user.id;
    await interaction.channel.setTopic(topicFor(ticket));
    await interaction.message.edit({ components: [controls(true)] });
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription('✅ Ticket wurde von <@' + interaction.user.id + '> übernommen.')] });
    return true;
  }
  if (interaction.customId === 'ticket:transcript') {
    if (!isTeam(interaction, config) && interaction.user.id !== ticket.requesterId) {
      await interaction.reply({ content: 'Du kannst für dieses Ticket kein Transcript erstellen.', ephemeral: true });
      return true;
    }
    await interaction.deferReply({ ephemeral: true });
    const messages = [];
    let before;
    while (messages.length < 500) {
      const batch = await interaction.channel.messages.fetch({ limit: 100, before }).catch(() => null);
      if (!batch?.size) break;
      messages.push(...batch.values());
      before = batch.last().id;
      if (batch.size < 100) break;
    }
    messages.sort((a,b) => a.createdTimestamp - b.createdTimestamp);
    const lines = messages.map(m => '[' + new Date(m.createdTimestamp).toISOString() + '] ' + (m.author?.tag || 'Unbekannt') + ': ' + (m.cleanContent || '[Embed/Anhang]'));
    const dir = path.join(process.cwd(), 'data', 'transcripts');
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, ticket.caseId + '.txt');
    await fs.writeFile(file, lines.join('\n'), 'utf8');
    await interaction.editReply({ content: '📄 Transcript für **#' + ticket.caseId + '**:', files: [file] });
    await sendLog(interaction.guild, 'Ticket Transcript', 'Case: #' + ticket.caseId + '\nErstellt von: <@' + interaction.user.id + '>', config.logChannelId);
    return true;
  }
  if (interaction.customId === 'ticket:close-request') {
    if (interaction.user.id !== ticket.requesterId && !isTeam(interaction, config)) {
      await interaction.reply({ content: 'Du kannst für dieses Ticket keine Schließung anfragen.', ephemeral: true });
      return true;
    }
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xfee75c).setTitle('❓ Schließungs-Anfrage')
      .setDescription('<@' + interaction.user.id + '> möchte dieses Ticket schließen. Ein Teammitglied kann die Schließung bestätigen.')],
      allowedMentions: { users: [interaction.user.id] } });
    return true;
  }
  if (interaction.customId === 'ticket:close') {
    if (interaction.user.id !== ticket.requesterId && !isTeam(interaction, config)) {
      await interaction.reply({ content: 'Du kannst dieses Ticket nicht schließen.', ephemeral: true });
      return true;
    }
    ticket.state = 'closed';
    await interaction.channel.setTopic(topicFor(ticket));
    await interaction.channel.permissionOverwrites.edit(ticket.requesterId, { SendMessages: false, ViewChannel: true, ReadMessageHistory: true });
    await interaction.message.edit({ components: [] });
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('🔒 Ticket geschlossen')
      .setDescription('Geschlossen von <@' + interaction.user.id + '>.').setFooter({ text: 'Case #' + ticket.caseId })] });
    await sendLog(interaction.guild, 'Ticket geschlossen', 'Case: #' + ticket.caseId + '\nTicket: <#' + interaction.channelId + '>\nVon: <@' + interaction.user.id + '>', config.logChannelId);
    return true;
  }
  return false;
}
module.exports = { sendTicketPanel, handleTicketInteraction, parseTopic, DEFAULT_CATEGORIES };
