const { Events, AuditLogEvent } = require('discord.js');
const { sendLog, field } = require('../utils/auditLog');

const text = value => value === null || value === undefined || value === '' ? 'Leer' : String(value).slice(0, 900);
const label = (value, choices) => choices[value] || String(value ?? 'Unbekannt');

module.exports = {
  name: Events.GuildUpdate,
  async execute(before, after) {
    const changes = [];
    if (before.name !== after.name) changes.push(field('Servername', `${text(before.name)} → ${text(after.name)}`));
    if (before.description !== after.description) changes.push(field('Serverbeschreibung', `${text(before.description)} → ${text(after.description)}`));
    if (before.icon !== after.icon) changes.push(field('Serverbild', `${before.iconURL?.({ extension: 'png', size: 256 }) || 'Entfernt'} → ${after.iconURL?.({ extension: 'png', size: 256 }) || 'Entfernt'}`));
    if (before.banner !== after.banner) changes.push(field('Serverbanner', `${before.bannerURL?.({ extension: 'png', size: 512 }) || 'Entfernt'} → ${after.bannerURL?.({ extension: 'png', size: 512 }) || 'Entfernt'}`));
    if (before.preferredLocale !== after.preferredLocale) changes.push(field('Serversprache', `${text(before.preferredLocale)} → ${text(after.preferredLocale)}`, true));
    if (before.verificationLevel !== after.verificationLevel) changes.push(field('Verifizierungsstufe', `${label(before.verificationLevel, ['Keine', 'Niedrig', 'Mittel', 'Hoch', 'Sehr hoch'])} → ${label(after.verificationLevel, ['Keine', 'Niedrig', 'Mittel', 'Hoch', 'Sehr hoch'])}`, true));
    if (before.explicitContentFilter !== after.explicitContentFilter) changes.push(field('Medienfilter', `${text(before.explicitContentFilter)} → ${text(after.explicitContentFilter)}`, true));
    if (before.defaultMessageNotifications !== after.defaultMessageNotifications) changes.push(field('Standardbenachrichtigungen', `${text(before.defaultMessageNotifications)} → ${text(after.defaultMessageNotifications)}`, true));
    if (before.afkChannelId !== after.afkChannelId) changes.push(field('AFK-Kanal', `${before.afkChannelId ? `<#${before.afkChannelId}>` : 'Keiner'} → ${after.afkChannelId ? `<#${after.afkChannelId}>` : 'Keiner'}`, true));
    if (before.afkTimeout !== after.afkTimeout) changes.push(field('AFK-Zeitlimit', `${before.afkTimeout ?? 'Unbekannt'}s → ${after.afkTimeout ?? 'Unbekannt'}s`, true));
    if (before.systemChannelId !== after.systemChannelId) changes.push(field('Systemkanal', `${before.systemChannelId ? `<#${before.systemChannelId}>` : 'Keiner'} → ${after.systemChannelId ? `<#${after.systemChannelId}>` : 'Keiner'}`, true));
    if (before.rulesChannelId !== after.rulesChannelId) changes.push(field('Regelkanal', `${before.rulesChannelId ? `<#${before.rulesChannelId}>` : 'Keiner'} → ${after.rulesChannelId ? `<#${after.rulesChannelId}>` : 'Keiner'}`, true));
    if (before.publicUpdatesChannelId !== after.publicUpdatesChannelId) changes.push(field('Community-Updates', `${before.publicUpdatesChannelId ? `<#${before.publicUpdatesChannelId}>` : 'Keiner'} → ${after.publicUpdatesChannelId ? `<#${after.publicUpdatesChannelId}>` : 'Keiner'}`, true));
    if (before.vanityURLCode !== after.vanityURLCode) changes.push(field('Einladungslink', `${text(before.vanityURLCode)} → ${text(after.vanityURLCode)}`, true));
    if (!changes.length) return;
    changes.push(field('Server-ID', `\`${after.id}\``), field('Geändert von', 'Wird über das Audit-Log ermittelt'));
    await sendLog(after, 'Server geändert', { description: `Servereinstellungen von **${after.name}** wurden geändert.`, fields: changes }, null, after.id,
      { auditType: AuditLogEvent.GuildUpdate });
  }
};
