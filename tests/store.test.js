'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { makeStore } = require('../src/store');
const { makeOAuth } = require('../src/oauth');

test('OAuth token encryption and persistent member records roundtrip', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'novora-test-'));
  try {
    const key = crypto.randomBytes(32).toString('hex');
    const store = makeStore(dir, key);
    const token = 'secret-token-do-not-expose';
    const encrypted = store.encrypt(token);
    assert.notEqual(encrypted, token);
    assert.equal(store.decrypt(encrypted), token);
    store.state.members['123456789012345678'] = { username:'tester',access:encrypted };
    await store.persist();
    const restored = makeStore(dir,key);
    assert.equal(restored.state.members['123456789012345678'].username,'tester');
    assert.equal(restored.decrypt(restored.state.members['123456789012345678'].access),token);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});

test('OAuth requests full Discord authorization independently of optional transfer targets', () => {
  const store = { state:{members:{}}, persist: async()=>{}, encrypt:()=>'', decrypt:()=>'' };
  const oauth = makeOAuth({clientId:'123456789012345678',clientSecret:'hidden',publicUrl:'https://verify.example.com',store});
  const base = new URL(oauth.begin('987654321012345678',[]));
  assert.equal(base.searchParams.get('scope'),'identify guilds guilds.join');
  assert.equal(base.searchParams.get('redirect_uri'),'https://verify.example.com/oauth/callback');
  const optin = new URL(oauth.begin('987654321012345678',['112233445566778899']));
  assert.equal(optin.searchParams.get('scope'),'identify guilds guilds.join');
  assert.equal(optin.searchParams.get('prompt'),null); // Discord remembers the previous grant, no forced second prompt
});

test('OAuth callback verifies user and persists record without transfer permission', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'novora-callback-test-'));
  const originalFetch = global.fetch;
  try {
    const store = makeStore(dir, crypto.randomBytes(32).toString('hex'));
    let validated = 0;
    const oauth = makeOAuth({
      clientId: '123456789012345678', clientSecret:'hidden', publicUrl:'https://verify.example.com', store,
      validateMember: async (guild, member) => {
        assert.equal(guild,'987654321012345678');
        assert.equal(member,'123456789012345678');
        validated++;
      }
    });
    const authUrl = new URL(oauth.begin('987654321012345678', []));
    global.fetch = async url => {
      if (String(url).endsWith('/oauth2/token')) return { ok: true, json: async () => ({
        scope: 'identify guilds guilds.join', access_token: 'sample', refresh_token: 'sample-refresh', expires_in: 3600
      }) };
      if (String(url).endsWith('/users/@me')) return { ok: true, json: async () => ({
        id:'123456789012345678', username:'novora-test', global_name:'Novora Tester', avatar: null
      }) };
      throw new Error('unexpected fetch: '+url);
    };
    const verified=await oauth.complete('mock-code', authUrl.searchParams.get('state'));
    assert.equal(verified.member.username,'novora-test');
    assert.equal(verified.joined,false);
    assert.deepEqual(verified.member.transfer.allowedTargets,[]);
    assert.ok(verified.member.transfer.scopes.includes('guilds.join'));
    assert.equal(validated,1);
    assert.equal(store.state.members['123456789012345678'].guildId,'987654321012345678');
    assert.ok(fs.existsSync(path.join(dir, 'state.json')));
  } finally {
    global.fetch=originalFetch;
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
