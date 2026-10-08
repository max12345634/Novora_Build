const { Events, AuditLogEvent } = require('discord.js');
const { sendLog, channelTypeName, field } = require('../utils/auditLog');

module.exports = {
  name: Events.ChannelUpdate,
  async execute(before, after) {
    if (!after.guild) return;
    const changes = [];
    if (before.name !== after.name) changes.push(field('Name', `\`${before.name}\` → \`${after.name}\``));
    if (before.parentId !== after.parentId) changes.push(field('Kategorie', `${before.parent?.name || 'Keine'} → ${after.parent?.name || 'Keine'}`));
    if ('topic' in before && before.topic !== after.topic) changes.push(field('Thema', `${before.topic || 'Leer'} → ${after.topic || 'Leer'}`));
    if (before.nsfw !== after.nsfw) changes.push(field('NSFW', `${before.nsfw ? 'Ja' : 'Nein'} → ${after.nsfw ? 'Ja' : 'Nein'}`, true));
    if (before.rateLimitPerUser !== after.rateLimitPerUser) changes.push(field('Slowmode', `${before.rateLimitPerUser || 0}s → ${after.rateLimitPerUser || 0}s`, true));
    if (!changes.length) return;
    changes.push(field('Kanal', `<#${after.id}> · ${channelTypeName(after)}`), field('Kanal-ID', `\`${after.id}\``),
      field('Bearbeitet von', 'Nicht ermittelt (Novora braucht „Audit-Log anzeigen“)'));
    await sendLog(after.guild, 'Kanal geändert', { description: `Einstellungen von **#${after.name}** wurden geändert.`, fields: changes }, null, after.id,
      { auditType: AuditLogEvent.ChannelUpdate, timestamp: Date.now() });
  }
};
