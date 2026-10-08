const test = require('node:test');
const assert = require('node:assert/strict');
const { form, openCount, categoryAtCapacity, canClaim, formatAnswer } = require('../src/features/tickets');
const { parseTicketQuestions } = require('../src/features/setup');

test('Ticket owner cannot claim their own ticket', () => {
  assert.equal(canClaim({ requesterId: 'user-1' }, 'user-1'), false);
  assert.equal(canClaim({ requesterId: 'user-1' }, 'staff-1'), true);
});

test('Category capacity is a soft ping threshold and only counts open tickets', () => {
  const config = { records: { one: { categoryId: 'support', state: 'open' }, two: { categoryId: 'support', state: 'closed' },
    three: { categoryId: 'billing', state: 'open' } } };
  const category = { id: 'support', capacity: 1 };
  assert.equal(openCount(config, 'support'), 1);
  assert.equal(categoryAtCapacity(config, category), true);
  assert.equal(categoryAtCapacity(config, { id: 'support', capacity: 0 }), false);
});

test('Ticket forms accept file uploads and text fields within Discord modal limits', () => {
  const modal = form({ id: 'support', name: 'Support', questions: [
    { id: 'issue', label: 'Beschreibe dein Anliegen', style: 'paragraph' },
    { id: 'proof', label: 'Beweisdatei', type: 'file', maxFiles: 3, required: false }
  ] }).toJSON();
  assert.equal(modal.components.length, 2);
  assert.equal(modal.components[1].component.type, 19);
  assert.equal(modal.components[1].component.max_values, 3);
});

test('Setup parses editable file and short-answer ticket questions', () => {
  assert.deepEqual(parseTicketQuestions('Kurz: Discord-Name\nDatei: Screenshot'), [
    { id: 'q1', label: 'Discord-Name', style: 'short' },
    { id: 'q2', label: 'Screenshot', type: 'file', maxFiles: 3 }
  ]);
});

test('Uploaded file answers are readable in the ticket panel', () => {
  assert.match(formatAnswer([{ name: 'screenshot.png', url: 'https://cdn.discordapp.com/file.png' }]), /screenshot\.png/);
  assert.match(formatAnswer([{ name: 'screenshot.png', url: 'https://cdn.discordapp.com/file.png' }]), /cdn\.discordapp\.com/);
});
