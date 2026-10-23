'use strict';
const crypto = require('node:crypto');
const id = value => /^\d{15,22}$/.test(String(value || '')) ? String(value) : '';
function userAvatar(user) {
  if (user.avatar && /^[A-Za-z0-9_]+$/.test(user.avatar)) return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
  return `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(user.id) >> 22n) % 6n)}.png`;
}
function makeOAuth({ clientId, clientSecret, publicUrl, store, validateMember = async () => {} }) {
  const redirect = publicUrl.replace(/\/$/, '') + '/oauth/callback';
  const pending = new Map();
  const scopes = new Set(['identify', 'guilds', 'guilds.join']);
  setInterval(() => { for (const [token, state] of pending) if (Date.now() > state.until) pending.delete(token); }, 60000).unref();
  function begin(guildId, targets) {
    const s = crypto.randomBytes(24).toString('base64url');
    const selected = targets.filter(x => id(x));
    pending.set(s, { guildId, targets: selected, until: Date.now() + 10 * 60000 });
    const auth = new URL('https://discord.com/oauth2/authorize');
    auth.searchParams.set('client_id', clientId); auth.searchParams.set('response_type', 'code');
    auth.searchParams.set('redirect_uri', redirect); auth.searchParams.set('scope', 'identify guilds guilds.join');
    auth.searchParams.set('state', s); // Discord asks for consent when needed; do not force re-prompt each time.
    return auth.toString();
  }
  async function tokenRequest(params) {
    const response = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, redirect_uri: redirect, ...params }),
      signal: AbortSignal.timeout(18000)
    });
    if (!response.ok) throw new Error('Discord OAuth token exchange failed: HTTP ' + response.status);
    return response.json();
  }
  async function getUser(accessToken) {
    const response = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: 'Bearer ' + accessToken }, signal: AbortSignal.timeout(18000)
    });
    if (!response.ok) throw new Error('Could not verify Discord identity');
    return response.json();
  }
  async function complete(code, state) {
    const context = pending.get(String(state));
    if (!context || context.until < Date.now()) throw new Error('Ungültige oder abgelaufene Verifizierung. Bitte erneut starten.');
    pending.delete(String(state));
    if (typeof code !== 'string' || code.length > 400) throw new Error('Ungültiger OAuth2-Code');
    const tokens = await tokenRequest({ grant_type: 'authorization_code', code });
    const granted = new Set(String(tokens.scope || '').split(' '));
    if (!granted.has('identify') || !granted.has('guilds') || !granted.has('guilds.join')) throw new Error('Discord-Autorisierung benötigt identify, guilds und guilds.join');
    const profile = await getUser(tokens.access_token);
    if (!id(profile.id)) throw new Error('Discord-Nutzer konnte nicht erkannt werden');
    await validateMember(context.guildId, profile.id);
    const old = store.state.members[profile.id] || { id: profile.id, counts: {} };
    const transfer = {
      access: store.encrypt(tokens.access_token), refresh: store.encrypt(tokens.refresh_token),
      expiresAt: Date.now() + Number(tokens.expires_in || 0) * 1000,
      allowedTargets: [...context.targets], authorizedAt: Date.now(), scopes: [...granted]
    };
    const member = { ...old, id: profile.id, username: String(profile.username || '').slice(0, 64),
      displayName: String(profile.global_name || profile.username || '').slice(0, 80), avatar: userAvatar(profile),
      guildId: context.guildId, verifiedAt: Date.now(),
      verifiedGuildIds:[...new Set([...(old.verifiedGuildIds||[]),context.guildId])], transfer };
    store.state.members[profile.id] = member;
    await store.persist();
    return { member, guildId: context.guildId, joined: context.targets.length > 0 };
  }
  async function freshAccess(member) {
    const transfer = member?.transfer;
    if (!transfer?.allowedTargets?.length) throw new Error('Keine gültige Zustimmung');
    if (transfer.expiresAt > Date.now() + 90 * 1000) return store.decrypt(transfer.access);
    const tokens = await tokenRequest({ grant_type: 'refresh_token', refresh_token: store.decrypt(transfer.refresh) });
    if (!new Set(String(tokens.scope || '').split(' ')).has('guilds.join')) throw new Error('Transfer-Berechtigung wurde zurückgezogen');
    member.transfer = { ...transfer, access: store.encrypt(tokens.access_token), refresh: store.encrypt(tokens.refresh_token || store.decrypt(transfer.refresh)), expiresAt: Date.now() + Number(tokens.expires_in || 0) * 1000 };
    await store.persist();
    return tokens.access_token;
  }
  async function revoke(member) {
    if (!member?.transfer?.refresh) return false;
    const response=await fetch('https://discord.com/api/v10/oauth2/token/revoke', {
      method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,
        token:store.decrypt(member.transfer.refresh),token_type_hint:'refresh_token'}),
      signal:AbortSignal.timeout(15000)
    });
    return response.ok;
  }
  return { begin, complete, freshAccess, revoke };
}
module.exports = { makeOAuth, id };
