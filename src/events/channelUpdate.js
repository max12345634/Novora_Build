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
    const oldOverwrites = before.permissionOverwrites?.cache || new Map();
    const newOverwrites = after.permissionOverwrites?.cache || new Map();
    const overwriteIds = new Set([...oldOverwrites.keys(), ...newOverwrites.keys()]);
    const permissionChanges = [];
    for (const id of overwriteIds) {
      const oldValue = oldOverwrites.get(id), newValue = newOverwrites.get(id);
      const serialize = overwrite => overwrite && `${overwrite.type}:${overwrite.allow.bitfield}:${overwrite.deny.bitfield}`;
      if (serialize(oldValue) === serialize(newValue)) continue;
      const target = id === after.guild.roles.everyone.id ? '@everyone'
        : after.guild.roles.cache.has(id) ? `<@&${id}>` : `<@${id}>`;
      if (!oldValue) permissionChanges.push(`${target}: Berechtigungsregel hinzugefügt`);
      else if (!newValue) permissionChanges.push(`${target}: Berechtigungsregel entfernt`);
      else {
        const oldAllow = oldValue.allow.toArray(), newAllow = newValue.allow.toArray();
        const oldDeny = oldValue.deny.toArray(), newDeny = newValue.deny.toArray();
        const parts = [];
        const allowAdded = newAllow.filter(value => !oldAllow.includes(value));
        const allowRemoved = oldAllow.filter(value => !newAllow.includes(value));
        const denyAdded = newDeny.filter(value => !oldDeny.includes(value));
        const denyRemoved = oldDeny.filter(value => !newDeny.includes(value));
        if (allowAdded.length) parts.push(`erlaubt +${allowAdded.join(', ')}`);
        if (allowRemoved.length) parts.push(`erlaubt −${allowRemoved.join(', ')}`);
        if (denyAdded.length) parts.push(`verweigert +${denyAdded.join(', ')}`);
        if (denyRemoved.length) parts.push(`verweigert −${denyRemoved.join(', ')}`);
        permissionChanges.push(`${target}: ${parts.join('; ') || 'Berechtigungsregel geändert'}`);
      }
    }
    if (permissionChanges.length) changes.push(field('Kanalrechte geändert', permissionChanges.slice(0, 8).join('\n')));
    if (!changes.length) return;
    changes.push(field('Kanal', `<#${after.id}> · ${channelTypeName(after)}`), field('Kanal-ID', `\`${after.id}\``),
      field('Bearbeitet von', 'Nicht ermittelt (Novora braucht „Audit-Log anzeigen“)'));
    await sendLog(after.guild, 'Kanal geändert', { description: `Einstellungen von **#${after.name}** wurden geändert.`, fields: changes }, null, after.id,
      { auditType: AuditLogEvent.ChannelUpdate, timestamp: Date.now() });
  }
};
