const test = require('node:test');
const assert = require('node:assert/strict');
const { DESIGNS } = require('../src/features/designs');
const { templateForCode, analyzeGuild, draftFromAnalysis } = require('../src/features/setupPresets');
const { isConfiguredResponseChannel, setupSuggestions } = require('../src/features/ai');
const { migrateGuild } = require('../src/utils/guildSettings');

test('ten Discord-compatible design presets and code 0908 are available', () => {
  assert.equal(DESIGNS.length, 10);
  assert.equal(new Set(DESIGNS.map(value => value.id)).size, 10);
  assert.equal(templateForCode('invalid', 'Demo'), null);
  const preset = templateForCode('0908', 'Novora');
  assert.equal(preset.branding.projectName, 'Novora');
  assert.equal(preset.tickets.enabled, false);
  assert.ok(preset.tickets.categories.length > 0);
  assert.equal(preset.ai.channelEnabled, false);
});

test('server analysis only considers channels visible to the bot and prepares explicit draft references', () => {
  const text = (id, name, viewable = true) => ({ id, name, type: 0, parentId: null, viewable, isTextBased: () => true, isThread: () => false });
  const guild = { id: '123456789012345678', name: 'Demo', channels: { cache: new Map([
    ['1', text('111111111111111111', 'support-chat')], ['2', text('222222222222222222', 'private', false)]
  ]) }, roles: { cache: new Map([['3', { id: '333333333333333333', name: 'Support', managed: false }]]) } };
  const plan = analyzeGuild(guild, { tickets: { serverType: 'community', categories: [] } });
  assert.equal(plan.channelCount, 1);
  assert.equal(plan.recommendations.find(value => value.key === 'support').existingId, '111111111111111111');
  const draft = draftFromAnalysis(plan, { tickets: { categories: [{ id: 'kept' }], panelChannelId: '333333333333333333' }, ai: {} });
  assert.equal(draft.tickets.categories[0].id, 'kept');
  assert.equal(draft.tickets.panelChannelId, '333333333333333333');
  assert.equal(draft.ai.channelIds[0], '111111111111111111');
  assert.equal(draft.tickets.teamRoleId, '333333333333333333');
  assert.equal(draft.ai.channelEnabled, false);
});

test('response channel selection supports up to five channels and normalizes legacy settings', () => {
  const ids = ['111111111111111111', '222222222222222222'];
  const settings = migrateGuild({ ai: { enabled: true, channelEnabled: true, channelIds: ids } });
  assert.ok(isConfiguredResponseChannel(settings, ids[0]));
  assert.ok(isConfiguredResponseChannel(settings, ids[1]));
  assert.equal(isConfiguredResponseChannel(settings, '333333333333333333'), false);
  assert.deepEqual(migrateGuild({ ai: { channelId: ids[0] } }).ai.channelIds, [ids[0]]);
});

test('application recommendations are server-specific editable drafts', () => {
  const suggestions = setupSuggestions({ tickets: { serverType: 'rp', serverDescription: 'Deutscher Notruf Server mit Polizei und Feuerwehr' } });
  assert.deepEqual(suggestions.applications.map(value => value.id), ['polizei', 'feuerwehr']);
  assert.ok(suggestions.applications.every(value => value.enabled === false && value.questions.length >= 3));
  assert.equal(setupSuggestions({ tickets: { serverDescription: 'Minecraft survival mit eigenem Shop' } }).applications.length, 0);
});
