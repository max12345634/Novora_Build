const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Collection, AuditLogEvent, ChannelType } = require('discord.js');

const folder = path.join(os.tmpdir(), `novora-audit-test-${process.pid}`);
process.env.NOVORA_SETTINGS_PATH = path.join(folder, 'guild-settings.json');
const { updateGuildSettings } = require('../src/utils/guildSettings');
const { sendLog, resolveActor, channelTypeName, needed, field } = require('../src/utils/auditLog');

test('Channel create log is a branded card with structured fields and timestamp', async () => {
  await fs.mkdir(folder, { recursive: true });
  try {
    await updateGuildSettings('guild-a', { logs: { enabled: true, channelId: 'log-channel', profile: 'erweitert' } });
    let payload;
    const guild = { id: 'guild-a', name: 'Novora Community', iconURL: () => null,
      channels: { fetch: async () => ({ isTextBased: () => true, send: async value => { payload = value; } }) },
      members: { me: { permissions: { has: () => true } } } };
    await sendLog(guild, 'Neuer Kanal erstellt', { description: 'Textkanal #reports wurde erstellt.',
      fields: [field('Name', '#reports'), field('Typ', 'Textkanal'), field('Kategorie', 'Support'), field('Erstellt von', 'Nicht ermittelt')] },
    null, null, { actorId: '123456789012345678' });
    assert.ok(payload);
    const embed = payload.embeds[0].toJSON();
    assert.match(embed.title, /Neuer Kanal erstellt/);
    assert.ok(embed.fields.some(v => v.name === 'Name' && v.value === '#reports'));
    assert.ok(embed.fields.some(v => v.name === 'Erstellt von' && v.value === '<@123456789012345678>'));
    assert.ok(embed.fields.some(v => v.name === 'Zeitpunkt'));
    assert.ok(embed.timestamp);
    assert.deepEqual(payload.allowedMentions, { parse: [] });
  } finally { await fs.rm(folder, { recursive: true, force: true }); }
});

test('Audit actor matching requires the correct target and channel', async () => {
  const entries = new Collection();
  entries.set('entry-1', { target: { id: 'channel-1' }, createdTimestamp: Date.now(),
    extra: { channel: { id: 'parent-channel' } }, executor: { id: 'moderator-1' }, reason: 'Setup' });
  const guild = { members: { me: { permissions: { has: permission => permission !== undefined } } },
    fetchAuditLogs: async options => { assert.equal(options.type, AuditLogEvent.ChannelCreate); return { entries }; } };
  const match = await resolveActor(guild, { auditType: AuditLogEvent.ChannelCreate, targetId: 'channel-1', channelId: 'parent-channel' });
  assert.equal(match.id, 'moderator-1');
  assert.equal(match.reason, 'Setup');
  assert.equal(await resolveActor(guild, { auditType: AuditLogEvent.ChannelCreate, targetId: 'channel-1', channelId: 'other' }), null);
});

test('Logging levels and Discord channel labels are explicit', () => {
  assert.equal(needed('Nachricht gelöscht'), 3);
  assert.equal(needed('Kanal erstellt'), 2);
  assert.equal(needed('Ticket geschlossen'), 1);
  assert.equal(channelTypeName({ type: ChannelType.GuildText }), 'Textkanal');
  assert.equal(channelTypeName({ type: ChannelType.GuildCategory }), 'Kategorie');
});
