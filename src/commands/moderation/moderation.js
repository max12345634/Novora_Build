const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { sendLog } = require('../../utils/auditLog');

const ACTIONS = {
  warn: {
    permission: PermissionFlagsBits.ModerateMembers,
    title: 'Verwarnung',
    description: 'Vermerkt eine Verwarnung im eingerichteten Server-Log.'
  },
  kick: {
    permission: PermissionFlagsBits.KickMembers,
    title: 'Kick',
    description: 'Kickt ein Mitglied vom Server.'
  },
  ban: {
    permission: PermissionFlagsBits.BanMembers,
    title: 'Ban',
    description: 'Bannt ein Mitglied oder einen Nutzer.'
  },
  timeout: {
    permission: PermissionFlagsBits.ModerateMembers,
    title: 'Timeout',
    description: 'Gibt einem Mitglied einen Timeout.'
  }
};

function buildData() {
  const builder = new SlashCommandBuilder()
    .setName('moderation')
    .setDescription('Fuehrt eine Moderationsaktion aus.');

  builder.addSubcommand((subcommand) => subcommand
    .setName('warn')
    .setDescription(ACTIONS.warn.description)
    .addUserOption((option) => option.setName('nutzer').setDescription('Zu verwarnende Person.').setRequired(true))
    .addStringOption((option) => option.setName('grund').setDescription('Grund der Verwarnung.').setRequired(true).setMaxLength(512)));

  builder.addSubcommand((subcommand) => subcommand
    .setName('kick')
    .setDescription(ACTIONS.kick.description)
    .addUserOption((option) => option.setName('nutzer').setDescription('Zu kickende Person.').setRequired(true))
    .addStringOption((option) => option.setName('grund').setDescription('Grund des Kicks.').setRequired(true).setMaxLength(512)));

  builder.addSubcommand((subcommand) => subcommand
    .setName('ban')
    .setDescription(ACTIONS.ban.description)
    .addUserOption((option) => option.setName('nutzer').setDescription('Zu bannender Nutzer.').setRequired(true))
    .addStringOption((option) => option.setName('grund').setDescription('Grund des Bans.').setRequired(true).setMaxLength(512))
    .addIntegerOption((option) => option.setName('nachrichten_tage').setDescription('Nachrichten der letzten 0 bis 7 Tage loeschen.').setMinValue(0).setMaxValue(7)));

  builder.addSubcommand((subcommand) => subcommand
    .setName('timeout')
    .setDescription(ACTIONS.timeout.description)
    .addUserOption((option) => option.setName('nutzer').setDescription('Person fuer den Timeout.').setRequired(true))
    .addIntegerOption((option) => option.setName('minuten').setDescription('Dauer in Minuten, maximal 28 Tage.').setRequired(true).setMinValue(1).setMaxValue(40320))
    .addStringOption((option) => option.setName('grund').setDescription('Grund des Timeouts.').setRequired(true).setMaxLength(512)));

  return builder;
}

async function fetchTargetMember(guild, userId) {
  return guild.members.fetch(userId).catch(() => null);
}

function canModerateTarget(interaction, target, botMember) {
  if (target.id === interaction.user.id || target.id === interaction.client.user.id) return false;
  if (target.id === interaction.guild.ownerId) return interaction.user.id === interaction.guild.ownerId;
  if (interaction.user.id !== interaction.guild.ownerId &&
      !interaction.memberPermissions.has(PermissionFlagsBits.Administrator) &&
      interaction.member.roles.highest.comparePositionTo(target.roles.highest) <= 0) return false;
  if (!botMember || botMember.roles.highest.comparePositionTo(target.roles.highest) <= 0) return false;
  return true;
}

module.exports = {
  data: buildData(),
  async execute(interaction) {
    const actionName = interaction.options.getSubcommand();
    const action = ACTIONS[actionName];
    if (!action) return;
    if (!interaction.memberPermissions?.has(action.permission)) {
      await interaction.reply({ content: 'Dir fehlt die Discord-Berechtigung fuer diese Aktion.', ephemeral: true });
      return;
    }

    const user = interaction.options.getUser('nutzer', true);
    const reason = interaction.options.getString('grund', actionName !== 'timeout' && actionName !== 'ban');
    let target = await fetchTargetMember(interaction.guild, user.id);
    if (['kick', 'timeout'].includes(actionName) && !target) {
      await interaction.reply({ content: 'Diese Person ist nicht mehr auf dem Server.', ephemeral: true });
      return;
    }
    if (target && !canModerateTarget(interaction, target, interaction.guild.members.me)) {
      await interaction.reply({ content: 'Diese Person steht in der Rollen-Hierarchie ueber dir oder ueber dem Bot. Die Aktion wurde nicht ausgefuehrt.', ephemeral: true });
      return;
    }
    if (!target && actionName === 'ban' && user.id === interaction.client.user.id) {
      await interaction.reply({ content: 'Der Bot kann sich nicht selbst bannen.', ephemeral: true });
      return;
    }

    const auditReason = reason || 'Kein Grund angegeben.';
    if (actionName === 'warn') {
      await sendLog(interaction.guild, 'Verwarnung', 'Person: <@' + user.id + '>\nModerator: <@' + interaction.user.id + '>\nGrund: ' + auditReason);
    } else if (actionName === 'kick') {
      await target.kick(auditReason);
      await sendLog(interaction.guild, 'Kick', 'Person: <@' + user.id + '>\nModerator: <@' + interaction.user.id + '>\nGrund: ' + auditReason);
    } else if (actionName === 'ban') {
      const deleteDays = interaction.options.getInteger('nachrichten_tage') || 0;
      await interaction.guild.members.ban(user.id, { deleteMessageSeconds: deleteDays * 86400, reason: auditReason });
      await sendLog(interaction.guild, 'Ban', 'Person: <@' + user.id + '>\nModerator: <@' + interaction.user.id + '>\nGrund: ' + auditReason + '\nNachrichten geloescht: ' + deleteDays + ' Tag(e)');
    } else if (actionName === 'timeout') {
      const minutes = interaction.options.getInteger('minuten', true);
      await target.timeout(minutes * 60 * 1000, auditReason);
      await sendLog(interaction.guild, 'Timeout', 'Person: <@' + user.id + '>\nModerator: <@' + interaction.user.id + '>\nDauer: ' + minutes + ' Minute(n)\nGrund: ' + auditReason);
    }

    const result = actionName === 'warn'
      ? 'Verwarnung fuer <@' + user.id + '> wurde im Log vermerkt.'
      : actionName === 'kick'
        ? '<@' + user.id + '> wurde vom Server gekickt.'
        : actionName === 'ban'
          ? '<@' + user.id + '> wurde gebannt.'
          : '<@' + user.id + '> hat einen Timeout fuer ' + interaction.options.getInteger('minuten', true) + ' Minute(n) erhalten.';
    await interaction.reply({ content: result, ephemeral: true, allowedMentions: { parse: [] } });
  }
};
