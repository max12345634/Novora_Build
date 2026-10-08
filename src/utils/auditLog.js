const { AuditLogEvent, ChannelType, PermissionFlagsBits } = require('discord.js');
const { getGuildSettings } = require('./guildSettings');
const { panel } = require('./theme');
const { logger } = require('./logger');

const RANK = { basis: 1, erweitert: 2, alles: 3 };
const TYPE_NAMES = new Map([
  [ChannelType.GuildText, 'Textkanal'], [ChannelType.GuildVoice, 'Sprachkanal'],
  [ChannelType.GuildCategory, 'Kategorie'], [ChannelType.GuildAnnouncement, 'Ankündigungskanal'],
  [ChannelType.GuildStageVoice, 'Bühnenkanal'], [ChannelType.GuildForum, 'Forum'],
  [ChannelType.GuildMedia, 'Medienkanal'], [ChannelType.PublicThread, 'Öffentlicher Thread'],
  [ChannelType.PrivateThread, 'Privater Thread'], [ChannelType.AnnouncementThread, 'Ankündigungs-Thread']
]);
const AUDIT_TYPES = {
  'Kanal erstellt': AuditLogEvent.ChannelCreate, 'Kanal gelöscht': AuditLogEvent.ChannelDelete,
  'Kanal geändert': AuditLogEvent.ChannelUpdate, 'Rolle erstellt': AuditLogEvent.RoleCreate,
  'Rolle gelöscht': AuditLogEvent.RoleDelete, 'Rolle geändert': AuditLogEvent.RoleUpdate,
  'Mitglied gebannt': AuditLogEvent.MemberBanAdd, 'Ban aufgehoben': AuditLogEvent.MemberBanRemove,
  'Mitglied geändert': AuditLogEvent.MemberUpdate, 'Nachricht gelöscht': AuditLogEvent.MessageDelete
};

function needed(title) {
  if (/Nachricht|Voice/i.test(title)) return 3;
  if (/Kanal|Rolle|Mitglied geändert/i.test(title)) return 2;
  return 1;
}
function channelTypeName(channel) {
  return TYPE_NAMES.get(channel?.type) || 'Discord-Kanal';
}
function show(value, fallback = 'Nicht verfügbar') {
  return value === null || value === undefined || value === '' ? fallback : String(value);
}
function field(name, value, inline = false) {
  return { name: String(name).slice(0, 256), value: String(value || 'Nicht verfügbar').slice(0, 1024), inline };
}
function timestamp(value = Date.now()) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

async function resolveActor(guild, { auditType, targetId, channelId, maxAgeMs = 15_000 } = {}) {
  if (!auditType || !targetId || !guild.members.me?.permissions.has(PermissionFlagsBits.ViewAuditLog)) return null;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const logs = await guild.fetchAuditLogs({ type: auditType, limit: 8 });
      const entry = logs.entries.find(item => {
        if (item.target?.id !== targetId || Date.now() - item.createdTimestamp > maxAgeMs || item.createdTimestamp > Date.now() + 2_000) return false;
        const auditChannel = item.extra?.channel?.id || item.extra?.channelId;
        return !channelId || String(auditChannel || '') === String(channelId);
      });
      if (entry?.executor) return { id: entry.executor.id, reason: entry.reason || null, timestamp: entry.createdAt?.toISOString() || null };
      if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 700));
    }
    return null;
  } catch (error) {
    logger.debug?.('Audit-Log nicht verfügbar; Aktion wird ohne ausführende Person protokolliert.', error);
    return null;
  }
}

/**
 * Sends one consistently branded event card. `description` may be a string (legacy call sites)
 * or an object containing description, fields, actorId, auditType and channelId.
 */
async function sendLog(guild, title, description, channelOverride = null, targetId = null, options = {}) {
  try {
    const settings = await getGuildSettings(guild.id), config = settings.logs || {};
    const channelId = channelOverride || config.channelId;
    if ((!config.enabled && !channelOverride) || !channelId || (!channelOverride && (RANK[config.profile || 'basis'] || 1) < needed(String(title)))) return;
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased() || !channel.send) return;

    const details = typeof description === 'object' && description !== null ? description : { description };
    const opts = { ...details, ...options };
    if (String(opts.channelId || '') === String(channelId)) return; // verhindert Log-Schleifen im Logkanal
    let audit = null;
    if (opts.actorId) audit = { id: opts.actorId, reason: opts.reason || null };
    else audit = await resolveActor(guild, { auditType: opts.auditType || AUDIT_TYPES[title], targetId: opts.targetId || targetId,
      channelId: opts.auditChannelId || opts.channelId });

    const fields = [...(opts.fields || [])];
    const actorField = fields.find(v => /ausgeführt von|erstellt von|gelöscht durch|bearbeitet von/i.test(v.name));
    if (audit?.id && actorField) {
      actorField.value = `<@${audit.id}>`;
    } else if (audit?.id) {
      fields.push(field('Ausgeführt von', `<@${audit.id}>`));
    }
    if (audit?.reason) fields.push(field('Audit-Grund', audit.reason));
    const occurredAt = timestamp(opts.timestamp || audit?.timestamp || Date.now());
    const embeds = panel(guild, settings, {
      title: `${opts.emoji || '📋'} ${title}`,
      description: opts.description || 'Das Ereignis wurde erfasst.',
      fields: [...fields, field('Zeitpunkt', `<t:${Math.floor(Date.parse(occurredAt) / 1000)}:F>`, true)],
      color: opts.color || config.color, thumbnailUrl: config.thumbnailUrl,
      imageUrl: config.imageUrl, footerText: config.footerText, footerImageUrl: config.footerImageUrl
    });
    embeds[0].setTimestamp(new Date(occurredAt));
    await channel.send({ embeds, allowedMentions: { parse: [] } });
  } catch (error) {
    logger.warn('Serverereignis konnte nicht protokolliert werden.', error);
  }
}

module.exports = { sendLog, needed, RANK, resolveActor, channelTypeName, field, timestamp };
