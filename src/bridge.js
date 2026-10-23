'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function makeBridge({ dir, snapshot, transfer, detail, messages, resolveInvite, roleAdmin, ops, security, ownerAlerts, changelog, support }) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const keyFile = path.join(dir, 'dashboard.key');
  let token = fs.existsSync(keyFile) ? fs.readFileSync(keyFile, 'utf8').trim() : '';
  if (!/^nvb_[a-f0-9]{64}$/.test(token)) {
    token = 'nvb_' + crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(keyFile, token + '\n', { mode: 0o600, flag: 'w' });
  }
  let pending = null;
  let invalidAttempts = 0;
  function newCode() {
    const code = crypto.randomInt(10000000, 100000000).toString();
    pending = { code, until: Date.now() + 10 * 60 * 1000 };
    invalidAttempts = 0;
    return code;
  }
  function pair(code) {
    if (!pending || Date.now() > pending.until) return { status: 403, body: { error: 'Verbindungscode abgelaufen. /website-verbinden erneut ausführen.' } };
    if (invalidAttempts >= 10) return { status: 429, body: { error: 'Zu viele Versuche. Neuen Code aus Discord anfordern.' } };
    if (typeof code !== 'string' || !/^\d{8}$/.test(code)) { invalidAttempts++; return { status: 403, body: { error: 'Ungültiger Verbindungscode' } }; }
    const a = Buffer.from(code);
    const b = Buffer.from(pending.code);
    if (!crypto.timingSafeEqual(a, b)) { invalidAttempts++; return { status: 403, body: { error: 'Ungültiger Verbindungscode' } }; }
    pending = null;
    return { status: 200, body: { ok: true, token } };
  }
  function authorized(value) {
    if (typeof value !== 'string' || !value.startsWith('Bearer ')) return false;
    const got = value.slice(7);
    const a = Buffer.from(got); const b = Buffer.from(token);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  return { newCode, pair, authorized, snapshot, transfer, detail, messages, resolveInvite, roleAdmin, ops, security, ownerAlerts, changelog, support };
}
// Only the Discord application owner can pair a global dashboard.
// For team-owned applications, the team owner (not the team ID) must authorize it.
function isApplicationOwner(application, userId) {
  const owner = application?.owner;
  if (!owner || typeof userId !== 'string') return false;
  if (typeof owner.ownerId === 'string') return owner.ownerId === userId;
  return owner.id === userId;
}
module.exports = { makeBridge, isApplicationOwner };
