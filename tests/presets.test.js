const test = require('node:test');
const assert = require('node:assert/strict');
const { SERVER_TYPES, suggest } = require('../src/features/presets');
const { fallback, sensitive, isQuestion } = require('../src/features/ai');

test('Presets combine server type and description without RP defaults for every server', () => {
  assert.ok(SERVER_TYPES.length >= 100);
  const shop = suggest('shop').map(v => v.id);
  assert.ok(shop.includes('payment') && !shop.includes('faction'));
  const minecraftShop = suggest('minecraft', 'Survival mit Shop').map(v => v.id);
  assert.ok(minecraftShop.includes('bug') && minecraftShop.includes('purchase'));
  assert.ok(suggest('development').some(v => v.id === 'api'));
});

test('FAQ remains guild scoped and sensitive questions require staff', () => {
  const a = { ai: { faq: [{ q: 'Wo ist die Anleitung?', a: 'https://a.example/hilfe' }] } };
  const b = { ai: { faq: [{ q: 'Wo ist die Anleitung?', a: 'https://b.example/hilfe' }] } };
  assert.match(fallback(a, 'Wo ist die Anleitung?'), /a\.example/);
  assert.match(fallback(b, 'Wo ist die Anleitung?'), /b\.example/);
  assert.ok(sensitive('Beschwerde gegen Teammitglied'));
});

test('FAQ matching accepts close wording but refuses unrelated questions', () => {
  const settings = { ai: { faq: [{ q: 'Wie bewerbe ich mich als Supporter?', a: 'Öffne das Bewerbungs-Panel.' }] } };
  assert.equal(fallback(settings, 'Wie kann ich mich als Supporter bewerben?'), 'Öffne das Bewerbungs-Panel.');
  assert.match(fallback(settings, 'Wie ist das Wetter morgen?'), /keine sichere Antwort/);
  assert.equal(isQuestion('Hallo'), true);
  assert.equal(fallback(settings, 'Hallo'), 'Hallo! 👋 Wobei kann ich dir helfen?');
  assert.equal(isQuestion('Das ist nur eine Aussage.'), false);
  assert.equal(isQuestion('Wo finde ich das Regelwerk'), true);
});
