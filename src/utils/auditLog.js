const { AuditLogEvent, PermissionFlagsBits } = require('discord.js');
const { getGuildSettings } = require('./guildSettings');
const { panel } = require('./theme');
const { logger } = require('./logger');
const RANK = { basis: 1, erweitert: 2, alles: 3 };
function needed(title) {
  if (/Nachricht|Voice/i.test(title)) return 3;
  if (/Kanal|Rolle|Mitglied geändert/i.test(title)) return 2;
  return 1;
}
const TYPES = { 'Kanal erstellt': AuditLogEvent.ChannelCreate, 'Kanal gelöscht': AuditLogEvent.ChannelDelete,
  'Rolle erstellt': AuditLogEvent.RoleCreate, 'Rolle gelöscht': AuditLogEvent.RoleDelete,
  'Mitglied gebannt': AuditLogEvent.MemberBanAdd, 'Ban aufgehoben': AuditLogEvent.MemberBanRemove };
async function actor(guild, title, targetId) {
  if (!TYPES[title] || !targetId || !guild.members.me?.permissions.has(PermissionFlagsBits.ViewAuditLog)) return null;
  try {
    const logs = await guild.fetchAuditLogs({ type: TYPES[title], limit: 5 });
    const entry = logs.entries.find(e => e.target?.id === targetId && Math.abs(Date.now() - e.createdTimestamp) < 12_000);
    return entry ? { user: entry.executor?.id, reason: entry.reason } : null;
  } catch { return null; } // Audit-Eintrag kann verzögert erscheinen oder unzugänglich sein.
}
async function sendLog(guild, title, description, channelOverride = null, targetId = null) {
  try {
    const settings = await getGuildSettings(guild.id), c = settings.logs || {};
    const channelId = channelOverride || c.channelId;
    if ((!c.enabled && !channelOverride) || !channelId || (!channelOverride && (RANK[c.profile || 'basis'] || 1) < needed(String(title)))) return;
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) return;
    const audit = await actor(guild, title, targetId);
    const detail = `${String(description || 'Keine weiteren Details.').slice(0, 3200)}${audit?.user ? `\nAusgeführt von: <@${audit.user}>` : ''}${audit?.reason ? `\nGrund: ${audit.reason.slice(0, 300)}` : ''}`;
    await channel.send({ embeds: panel(guild, settings, { title: `📋 ${title}`, description: detail }), allowedMentions: { parse: [] } });
  } catch (error) { logger.warn('Serverereignis konnte nicht protokolliert werden.', error); }
}
module.exports = { sendLog, needed, RANK, actor };
