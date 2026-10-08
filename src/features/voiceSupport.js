const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { getGuildSettings, updateGuildSettings } = require('../utils/guildSettings');
const { panel } = require('../utils/theme');
const { logger } = require('../utils/logger');

function safeName(value) {
  return String(value || 'mitglied').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'mitglied';
}
async function storeRoom(guildId, roomId, value) {
  await updateGuildSettings(guildId, old => ({ voiceSupport: { ...old.voiceSupport,
    rooms: { ...(old.voiceSupport?.rooms || {}), [roomId]: value } } }));
}
async function removeRoom(guildId, roomId) {
  await updateGuildSettings(guildId, old => {
    const rooms = { ...(old.voiceSupport?.rooms || {}) }; delete rooms[roomId];
    return { voiceSupport: { ...old.voiceSupport, rooms } };
  });
}
async function handleVoiceSupport(before, after) {
  const guild = after.guild || before.guild;
  if (!guild) return;
  const settings = await getGuildSettings(guild.id), config = settings.voiceSupport || {};
  if (!config.enabled) return;

  if (after.channelId === config.lobbyChannelId && before.channelId !== config.lobbyChannelId && after.member) {
    const member = after.member;
    const rooms = config.rooms || {};
    const existing = Object.entries(rooms).find(([, room]) => room.ownerId === member.id);
    const existingRoom = existing && await guild.channels.fetch(existing[0]).catch(() => null);
    if (existingRoom?.type === ChannelType.GuildVoice) {
      await member.voice.setChannel(existingRoom, 'Bestehenden Voice-Support fortsetzen').catch(() => {});
      return;
    }
    const role = await guild.roles.fetch(config.supportRoleId).catch(() => null);
    const alert = await guild.channels.fetch(config.alertChannelId).catch(() => null);
    const category = config.categoryId && await guild.channels.fetch(config.categoryId).catch(() => null);
    const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
    if (!role || !alert?.isTextBased() || !botMember?.permissions.has([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers])) {
      logger.warn('Voice-Support konnte nicht gestartet werden: Rolle, Hinweis-Kanal oder Bot-Rechte fehlen.');
      return;
    }
    try {
      const room = await guild.channels.create({ name: `support-${safeName(member.displayName || member.user.username)}`.slice(0, 90),
        type: ChannelType.GuildVoice, parent: category?.type === ChannelType.GuildCategory ? category.id : undefined,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
          { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
          { id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
          { id: botMember.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers] }
        ], reason: `Voice-Support für ${member.user.tag}` });
      await storeRoom(guild.id, room.id, { ownerId: member.id, createdAt: new Date().toISOString(), supportRoleId: role.id });
      let moved = true;
      await member.voice.setChannel(room, 'Voice-Support').catch(async error => {
        moved = false;
        logger.warn('Nutzer konnte nicht in den Voice-Support verschoben werden.', error);
        await room.delete('Voice-Support konnte nicht betreten werden').catch(() => {});
        await removeRoom(guild.id, room.id);
      });
      if (!moved) return;
      await alert.send({ embeds: panel(guild, settings, { title: '📞 Voice-Support angefragt',
        description: `<@${member.id}> wartet auf Hilfe in ${room}.`, fields: [
          { name: 'Mitglied', value: `${member.user.tag || member.user.username} (<@${member.id}>)`, inline: true },
          { name: 'Sprachraum', value: `${room} · \`${room.id}\``, inline: true },
          { name: 'Zeitpunkt', value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
        ] }), content: `<@&${role.id}>`, allowedMentions: { roles: [role.id], parse: [] } });
    } catch (error) { logger.error('Voice-Support-Raum konnte nicht erstellt werden.', error); }
    return;
  }

  const roomId = before.channelId;
  if (!roomId || !config.rooms?.[roomId] || after.channelId === roomId) return;
  const room = await guild.channels.fetch(roomId).catch(() => null);
  if (room?.type === ChannelType.GuildVoice && room.members.size === 0) {
    await room.delete('Voice-Support-Raum ist leer').catch(error => logger.warn('Leerer Voice-Support-Raum blieb bestehen.', error));
    await removeRoom(guild.id, roomId);
  }
}
module.exports = { handleVoiceSupport, safeName };
