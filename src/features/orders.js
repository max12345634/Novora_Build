const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { getGuildSettings } = require('../utils/guildSettings');
const { sendLog } = require('../utils/auditLog');
const { panel } = require('../utils/theme');

const BUTTON_ID = 'order:open';
const MODAL_ID = 'order:form';
const TOPIC_PREFIX = 'novora-order:';

function parseOrderTopic(topic = '') {
  if (!topic.startsWith(TOPIC_PREFIX)) return null;
  const [requesterId, state] = topic.slice(TOPIC_PREFIX.length).split(':');
  if (!/^\d{17,20}$/.test(requesterId) || !['open', 'closed'].includes(state)) return null;
  return { requesterId, state };
}

function makeOrderControls(closed = false) {
  const button = new ButtonBuilder()
    .setCustomId(closed ? 'order:reopen' : 'order:close')
    .setLabel(closed ? 'Wieder öffnen' : 'Bestellung schließen')
    .setStyle(closed ? ButtonStyle.Success : ButtonStyle.Secondary);
  return new ActionRowBuilder().addComponents(button);
}

function makeForm() {
  const modal = new ModalBuilder().setCustomId(MODAL_ID).setTitle('Bestellung bei Novora');
  const inputs = [
    ['server', 'Wie heißt dein Server?', TextInputStyle.Short, true],
    ['zweck', 'Wofür ist dein Server?', TextInputStyle.Short, true],
    ['plattform', 'Welche Plattform nutzt du?', TextInputStyle.Short, true],
    ['umfang', 'Was soll gebaut werden?', TextInputStyle.Paragraph, true],
    ['details', 'Weitere Wünsche oder Infos', TextInputStyle.Paragraph, false]
  ].map(([id, label, style, required]) => new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setMaxLength(style === TextInputStyle.Paragraph ? 1000 : 100)
  ));
  modal.addComponents(...inputs);
  return modal;
}

async function sendOrderPanel(channel, guild) {
  const settings = await getGuildSettings(guild.id);
  await channel.send({
    embeds: panel(guild, settings, { title: `🛠️ ${settings.branding?.projectName || guild.name} · Bestellung`,
      description: 'Du möchtest einen Server bauen lassen? Öffne das Formular. Deine Antworten werden anschließend in einem privaten Bestell-Ticket an unser Team gesendet.' }),
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(BUTTON_ID).setLabel('Bestellung starten').setStyle(ButtonStyle.Primary)
    )],
    allowedMentions: { parse: [] }
  });
}

function isTeam(interaction, config) {
  const roles = interaction.member?.roles;
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels) ||
    Boolean(roles?.cache?.has(config.teamRoleId)) ||
    (Array.isArray(roles) && roles.includes(config.teamRoleId));
}

async function handleOrderInteraction(interaction, allowedGuildId) {
  if (!interaction.inGuild() || interaction.guildId !== allowedGuildId) return false;

  if (interaction.isButton() && interaction.customId === BUTTON_ID) {
    const config = (await getGuildSettings(interaction.guildId)).orders;
    if (!config?.enabled) {
      await interaction.reply({ content: 'Das Bestellsystem ist noch nicht eingerichtet.', ephemeral: true });
      return true;
    }
    const existing = interaction.guild.channels.cache.find((channel) => {
      const order = parseOrderTopic(channel.topic);
      return order?.requesterId === interaction.user.id && order.state === 'open';
    });
    if (existing) {
      await interaction.reply({ content: 'Du hast bereits ein offenes Bestell-Ticket: ' + existing, ephemeral: true });
      return true;
    }
    await interaction.showModal(makeForm());
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId === MODAL_ID) {
    const allSettings = await getGuildSettings(interaction.guildId), config = allSettings.orders;
    if (!config?.enabled || !config.teamRoleId) {
      await interaction.reply({ content: 'Das Bestellsystem ist nicht mehr eingerichtet.', ephemeral: true });
      return true;
    }
    const existing = interaction.guild.channels.cache.find((channel) => {
      const order = parseOrderTopic(channel.topic);
      return order?.requesterId === interaction.user.id && order.state === 'open';
    });
    if (existing) {
      await interaction.reply({ content: 'Du hast bereits ein offenes Bestell-Ticket: ' + existing, ephemeral: true });
      return true;
    }

    await interaction.deferReply({ ephemeral: true });
    const answers = [
      ['Servername', interaction.fields.getTextInputValue('server')],
      ['Wofür ist der Server?', interaction.fields.getTextInputValue('zweck')],
      ['Plattform', interaction.fields.getTextInputValue('plattform')],
      ['Gewünschter Umfang', interaction.fields.getTextInputValue('umfang')],
      ['Weitere Infos', interaction.fields.getTextInputValue('details') || 'Keine weiteren Angaben']
    ];
    const overwrites = [
      { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
      { id: config.teamRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
    ];
    const parent = config.categoryId && interaction.guild.channels.cache.has(config.categoryId) ? config.categoryId : undefined;
    const channel = await interaction.guild.channels.create({
      name: 'bestellung-' + interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 60),
      type: ChannelType.GuildText,
      parent,
      topic: TOPIC_PREFIX + interaction.user.id + ':open',
      permissionOverwrites: overwrites
    });
    await channel.send({
      content: '<@' + interaction.user.id + '> <@&' + config.teamRoleId + '>',
      embeds: panel(interaction.guild, allSettings, { title: '🛠️ Neue Bestellung',
        description: 'Anfragende Person: <@' + interaction.user.id + '>',
        fields: answers.map(([name, value]) => ({ name, value: String(value).slice(0, 1000), inline: false })) }),
      components: [makeOrderControls()],
      allowedMentions: { users: [interaction.user.id], roles: [config.teamRoleId] }
    });
    await interaction.editReply({ content: 'Dein Bestell-Ticket wurde erstellt: ' + channel });
    await sendLog(interaction.guild, 'Bestellung eröffnet', 'Ticket: <#' + channel.id + '>\nPerson: <@' + interaction.user.id + '>', config.logChannelId);
    return true;
  }

  if (!interaction.isButton() || !['order:close', 'order:reopen'].includes(interaction.customId)) return false;
  const order = parseOrderTopic(interaction.channel?.topic);
  if (!order) return false;
  const config = (await getGuildSettings(interaction.guildId)).orders || {};
  const team = isTeam(interaction, config);
  const reopening = interaction.customId === 'order:reopen';
  if (!team && interaction.user.id !== order.requesterId) {
    await interaction.reply({ content: 'Nur du oder das Novora-Team kannst dieses Ticket ändern.', ephemeral: true });
    return true;
  }
  if (reopening && !team) {
    await interaction.reply({ content: 'Nur das Novora-Team kann ein geschlossenes Ticket wieder öffnen.', ephemeral: true });
    return true;
  }

  const state = reopening ? 'open' : 'closed';
  await interaction.channel.setTopic(TOPIC_PREFIX + order.requesterId + ':' + state);
  await interaction.channel.permissionOverwrites.edit(order.requesterId, {
    SendMessages: reopening,
    ViewChannel: true,
    ReadMessageHistory: true
  });
  await interaction.message.edit({ components: [makeOrderControls(!reopening)] });
  await interaction.reply({ content: reopening ? 'Bestell-Ticket wieder geöffnet.' : 'Bestell-Ticket geschlossen.', ephemeral: true });
  await sendLog(interaction.guild, reopening ? 'Bestellung wieder geöffnet' : 'Bestellung geschlossen', 'Ticket: <#' + interaction.channelId + '>\nGeändert von: <@' + interaction.user.id + '>', config.logChannelId);
  return true;
}

module.exports = { sendOrderPanel, handleOrderInteraction, parseOrderTopic, makeForm, makeOrderControls };
