const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const folder = path.join(os.tmpdir(), `novora-test-${process.pid}`);
process.env.NOVORA_SETTINGS_PATH = path.join(folder, 'guild-settings.json');
const { getGuildSettings, updateGuildSettings, readAllSettings } = require('../src/utils/guildSettings');

test('Concurrent updates preserve both guilds and nested ticket records', async () => {
  await fs.mkdir(folder, { recursive: true });
  try {
    await Promise.all(Array.from({ length: 40 }, (_, n) => updateGuildSettings(n % 2 ? 'guildA' : 'guildB', old => ({
      tickets: { ...old.tickets, records: { ...old.tickets.records, [`channel${n}`]: { caseId: `T-${n}` } } }
    }))));
    const a = await getGuildSettings('guildA'), b = await getGuildSettings('guildB');
    assert.equal(Object.keys(a.tickets.records).length, 20);
    assert.equal(Object.keys(b.tickets.records).length, 20);
    assert.equal(a.tickets.records.channel0, undefined);
    assert.equal(b.tickets.records.channel1, undefined);
    assert.equal((await readAllSettings()).guildA.schemaVersion, 2);
  } finally { await fs.rm(folder, { recursive: true, force: true }); }
});

test('Old guild settings are migrated without dropping unrelated features', async () => {
  await fs.mkdir(folder, { recursive: true });
  try {
    await fs.writeFile(process.env.NOVORA_SETTINGS_PATH, JSON.stringify({ old: { tickets: { enabled: true, teamRoleId: '123' }, orders: { enabled: true }, applications: { teamRoleId: '234' } } }));
    const old = await getGuildSettings('old');
    assert.equal(old.orders.enabled, true);
    assert.equal(old.tickets.categories.length, 5);
    assert.equal(old.applications.types[0].id, 'team');
  } finally { await fs.rm(folder, { recursive: true, force: true }); }
});
