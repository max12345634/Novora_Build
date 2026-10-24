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
  const updateGrantFile=path.join(dir,'update-authority.json');
  function readUpdateGrant(){
    try{const value=JSON.parse(fs.readFileSync(updateGrantFile,'utf8'));return value?.active===true?value:null}catch{return null}
  }
  function writeUpdateGrant(active){
    const tmp=updateGrantFile+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';
    fs.writeFileSync(tmp,JSON.stringify({active,changedAt:Date.now()})+'\n',{mode:0o600,flag:'wx'});
    fs.renameSync(tmp,updateGrantFile);
  }
  function newCode(purpose='dashboard') {
    if(!['dashboard','updates'].includes(purpose))throw Error('Ungültiger Verbindungszweck');
    const code = crypto.randomInt(10000000, 100000000).toString();
    pending = { code, purpose, until: Date.now() + 10 * 60 * 1000 };
    invalidAttempts = 0;
    return code;
  }
  function pair(code) {
    if (!pending || Date.now() >= pending.until) { pending=null; return { status: 403, body: { error: 'Verbindungscode abgelaufen. Neuen Code in Discord anfordern.' } }; }
    if (invalidAttempts >= 10) return { status: 429, body: { error: 'Zu viele Versuche. Neuen Code aus Discord anfordern.' } };
    if (typeof code !== 'string' || !/^\d{8}$/.test(code)) { invalidAttempts++; return { status: 403, body: { error: 'Ungültiger Verbindungscode' } }; }
    const a = Buffer.from(code);
    const b = Buffer.from(pending.code);
    if (!crypto.timingSafeEqual(a, b)) { invalidAttempts++; return { status: 403, body: { error: 'Ungültiger Verbindungscode' } }; }
    const purpose=pending.purpose;
    pending = null;
    if(purpose==='updates')writeUpdateGrant(true);
    return { status: 200, body: { ok: true, token, updateAuthorized:purpose==='updates'||!!readUpdateGrant() } };
  }
  function authorized(value) {
    if (typeof value !== 'string' || !value.startsWith('Bearer ')) return false;
    const got = value.slice(7);
    const a = Buffer.from(got); const b = Buffer.from(token);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  function updateAuthority(){const grant=readUpdateGrant();return {authorized:!!grant,changedAt:Number(grant?.changedAt||0)}}
  function revokeUpdates(){pending=null;writeUpdateGrant(false);return {ok:true,updateAuthorized:false}}
  return { newCode, pair, authorized, updateAuthority, revokeUpdates, snapshot, transfer, detail, messages, resolveInvite, roleAdmin, ops, security, ownerAlerts, changelog, support };
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
