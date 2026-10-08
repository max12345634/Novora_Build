const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

test('selected AI channel answers a greeting after showing typing', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'novora-ai-channel-'));
  process.env.NOVORA_SETTINGS_PATH = path.join(directory, 'settings.json');
  delete process.env.NOVORA_AI_ENDPOINT;
  delete process.env.NOVORA_AI_API_KEY;
  const { updateGuildSettings } = require('../src/utils/guildSettings');
  const { assistChannel } = require('../src/features/ai');
  const guildId = '123456789012345678';
  const channelId = '234567890123456789';
  await updateGuildSettings(guildId, { ai: { enabled: true, channelEnabled: true, channelIds: [channelId] } });
  const order = [];
  const channel = {
    id: channelId,
    isTextBased: () => true,
    isThread: () => false,
    sendTyping: async () => order.push('typing'),
    messages: { fetch: async () => new Map() }
  };
  const message = {
    id: '345678901234567890',
    guild: { id: guildId, name: 'Novora Test', memberCount: 2, iconURL: () => null },
    channel,
    author: { id: '456789012345678901', username: 'Max', bot: false },
    content: 'Hallo',
    reply: async payload => { order.push('reply'); message.response = payload; }
  };
  await assistChannel(message);
  assert.deepEqual(order, ['typing', 'reply']);
  assert.match(message.response.embeds[0].data.description, /Hallo! 👋 Wobei kann ich dir helfen\?/);
  assert.deepEqual(message.response.allowedMentions, { parse: [] });
  await fs.rm(directory, { recursive: true, force: true });
});
