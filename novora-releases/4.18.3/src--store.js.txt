'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function loadOrCreateEncryptionKey(dir, provided) {
  if (provided) {
    if (!/^[a-f0-9]{64}$/i.test(provided)) throw new Error('TOKEN_ENCRYPTION_KEY muss genau 64 Hex-Zeichen enthalten');
    return provided;
  }
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const keyFile = path.join(dir, 'encryption.key');
  if (fs.existsSync(keyFile)) {
    const existing = fs.readFileSync(keyFile, 'utf8').trim();
    if (!/^[a-f0-9]{64}$/i.test(existing)) throw new Error('Gespeicherter encryption.key ist beschädigt');
    return existing;
  }
  // Avoid silently losing access to previously encrypted tokens.
  const stateFile = path.join(dir, 'state.json');
  if (fs.existsSync(stateFile)) {
    const old = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (Object.values(old.members || {}).some(member => member?.transfer?.access || member?.transfer?.refresh)) {
      throw new Error('Vorhandene OAuth-Tokens benötigen den bisherigen TOKEN_ENCRYPTION_KEY. Nicht neu erzeugen.');
    }
  }
  const created = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(keyFile, created + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  console.log('Verschlüsselungsschlüssel lokal unter data/encryption.key erstellt. data/ sicher sichern und niemals öffentlich teilen.');
  return created;
}

function makeStore(dir, keyHex) {
  if (!/^[a-f0-9]{64}$/i.test(keyHex || '')) throw new Error('TOKEN_ENCRYPTION_KEY must contain exactly 64 hexadecimal characters.');
  const key = Buffer.from(keyHex, 'hex');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, 'state.json');
  let state = { version: 1, members: {}, guilds: {} };
  if (fs.existsSync(file)) {
    try { const obj = JSON.parse(fs.readFileSync(file, 'utf8')); state = { ...state, ...obj, members: obj.members || {}, guilds: obj.guilds || {} }; }
    catch (err) { throw new Error('Could not read state.json; please restore your backup: ' + err.message); }
  }
  let saving = Promise.resolve();
  // Each save gets an exclusive private temporary file. Never reuse a fixed
  // state.json.tmp: a stale/symlinked file must not be overwritten, and an
  // interrupted write must never truncate the last committed state.json.
  async function commitSnapshot(content) {
    const tmp = path.join(dir, '.state-' + crypto.randomBytes(12).toString('hex') + '.tmp');
    let handle;
    try {
      handle = await fs.promises.open(tmp, 'wx', 0o600);
      await handle.writeFile(content, 'utf8');
      await handle.sync();
      await handle.close();
      handle = undefined;
      await fs.promises.rename(tmp, file);
      // The file contents are synced above. Sync the directory entry when
      // supported (some hosting filesystems do not permit directory fsync).
      let directory;
      try {
        directory = await fs.promises.open(dir, 'r');
        await directory.sync();
      } catch (_) {
        // Rename has already committed; a directory fsync failure is not a
        // reason to retry the same snapshot or claim it was not saved.
      } finally {
        if (directory) await directory.close().catch(() => {});
      }
    } finally {
      if (handle) await handle.close().catch(() => {});
      await fs.promises.unlink(tmp).catch(err => {
        if (err.code !== 'ENOENT') throw err;
      });
    }
  }
  function persist() {
    const content = JSON.stringify(state);
    saving = saving.catch(() => {}).then(() => commitSnapshot(content));
    return saving;
  }
  function encrypt(plain) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    return Buffer.concat([iv, cipher.update(plain, 'utf8'), cipher.final(), cipher.getAuthTag()]).toString('base64url');
  }
  function decrypt(ciphertext) {
    const bytes = Buffer.from(ciphertext, 'base64url');
    if (bytes.length < 29) throw new Error('Encrypted token corrupted');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(bytes.length - 16));
    return decipher.update(bytes.subarray(12, bytes.length - 16), undefined, 'utf8') + decipher.final('utf8');
  }
  return { state, persist, encrypt, decrypt };
}
module.exports = { makeStore, loadOrCreateEncryptionKey };
