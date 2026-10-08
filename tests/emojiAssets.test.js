const test = require('node:test');
const assert = require('node:assert/strict');
const { Collection } = require('discord.js');
const { EMOJI_NAMES, emojiMarkup, replaceEmojiText, isEmojiAdmin, installApplicationEmojis } = require('../src/utils/emojiAssets');

test('custom Novora application emojis are guild independent and replace panel symbols', () => {
  const cache = new Collection([['1', { id: '1', name: 'novora_ticket' }], ['2', { id: '2', name: 'novora_check' }]]);
  const client = { application: { emojis: { cache } } };
  assert.equal(emojiMarkup(client, 'ticket'), '<:novora_ticket:1>');
  assert.equal(replaceEmojiText(client, '🎫 Ticket ✅'), '<:novora_ticket:1> Ticket <:novora_check:2>');
  assert.equal(emojiMarkup(client, 'logs', '📋'), '📋');
  assert.ok(EMOJI_NAMES.length >= 20);
});

test('only the application owner can install the pack and installs are idempotent', async () => {
  const cache = new Collection();
  const created = [];
  const emojis = {
    cache,
    fetch: async () => cache,
    create: async ({ name, attachment }) => {
      assert.ok(Buffer.isBuffer(attachment));
      assert.ok(attachment.length <= 256 * 1024);
      const emoji = { id: String(created.length + 1), name };
      created.push(emoji); cache.set(emoji.id, emoji); return emoji;
    }
  };
  const client = { application: { owner: { id: 'owner' }, emojis } };
  assert.equal(isEmojiAdmin(client, 'owner'), true);
  assert.equal(isEmojiAdmin(client, 'other'), false);
  await assert.rejects(installApplicationEmojis(client, 'other'), /Nur der Besitzer/);
  const first = await installApplicationEmojis(client, 'owner');
  assert.equal(first.created, EMOJI_NAMES.length);
  assert.equal(created.length, EMOJI_NAMES.length);
  const second = await installApplicationEmojis(client, 'owner');
  assert.equal(second.created, 0);
  assert.equal(second.existing, EMOJI_NAMES.length);
});
