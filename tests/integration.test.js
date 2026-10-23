'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { once } = require('node:events');
const { loadOrCreateEncryptionKey, makeStore } = require('../src/store');
const { normalizeJob, resultsForWebsite } = require('../src/jobs');
const { makeOAuth } = require('../src/oauth');
const { makeApi } = require('../src/api');
const { startWebsite } = require('../src/website');
const ID_A='123456789012345678', ID_B='987654321098765432', ID_C='112233445566778899';

// No external network or real Discord tokens are used here.
test('Auto-key is persistent across restart and is never silently regenerated for old tokens', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'novora-key-'));
  try {
    const key1=loadOrCreateEncryptionKey(dir,'');
    assert.match(key1,/^[a-f0-9]{64}$/);
    assert.equal(loadOrCreateEncryptionKey(dir,''),key1);
    const state=makeStore(dir,key1);
    state.state.members[ID_A]={id:ID_A,transfer:{access:state.encrypt('test'),refresh:state.encrypt('refresh')}};
    await state.persist();
    fs.unlinkSync(path.join(dir,'encryption.key'));
    assert.throws(()=>loadOrCreateEncryptionKey(dir,''),/bisherigen TOKEN_ENCRYPTION_KEY/);
    assert.equal(loadOrCreateEncryptionKey(dir,key1),key1);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});

test('Website job format matches bot format, rejected IDs never execute, and every user gets a result', () => {
  const good=normalizeJob({id:'a'.repeat(32),guildId:ID_B,userIds:[ID_A,ID_C]});
  assert.deepEqual(good,{id:'a'.repeat(32),guildId:ID_B,userIds:[ID_A,ID_C]});
  assert.equal(normalizeJob({id:'t_'+'a'.repeat(32),guildId:ID_B,userIds:[ID_A]}),null);
  assert.equal(normalizeJob({id:'a'.repeat(32),guildId:ID_B,userIds:[ID_A,ID_A]}),null);
  assert.equal(normalizeJob({id:'a'.repeat(32),guildId:ID_B,userIds:[]}),null);
  const result=resultsForWebsite(good,{completed:[{id:ID_A,status:'added'}],failed:[{id:ID_C,error:'Consent revoked'}]});
  assert.deepEqual(result,[{userId:ID_A,ok:true,message:'added'},{userId:ID_C,ok:false,message:'Consent revoked'}]);
  const totalFailure=resultsForWebsite(good,{ok:false,error:'Server is missing'});
  assert.equal(totalFailure.length,2);
  assert.ok(totalFailure.every(r=>!r.ok&&r.message==='Server is missing'));
});

test('Dashboard sync/API job acknowledgement matches actual AppDeploy routes and does not expose key', async () => {
  const originalFetch=global.fetch;
  const calls=[];
  try {
    global.fetch=async (url, options) => {
      calls.push({url:String(url),method:options.method,auth:options.headers.Authorization,body:options.body?JSON.parse(options.body):undefined});
      if (String(url).includes('/sync')) return {ok:true,status:200,text:async()=>JSON.stringify({ok:true,guilds:1,members:1})};
      if (String(url).includes('/jobs')) return {ok:true,status:200,text:async()=>JSON.stringify({jobs:[{id:'a'.repeat(32),guildId:ID_B,userIds:[ID_A]}]})};
      return {ok:true,status:200,text:async()=>JSON.stringify({ok:true})};
    };
    const owner='b26d5cd5-4290-4fd3-a9c7-260492b2496f';
    const api=makeApi('https://novora-verify-control-center-ae02zt.v2.appdeploy.ai',owner,'nv_'+'a'.repeat(64));
    await api.sync([{id:ID_B,name:'Test'}],[{id:ID_A,username:'Tester',consentTargets:[ID_B]}]);
    const result=await api.jobs();
    assert.equal(result.jobs[0].userIds[0],ID_A);
    await api.result('a'.repeat(32),[{userId:ID_A,ok:true,message:'added'}]);
    assert.equal(calls.length,3);
    assert.equal(new URL(calls[0].url).pathname,'/api/bot/sync');
    assert.equal(calls[0].body.ownerId,owner);
    assert.deepEqual(calls[0].body.members[0].consentTargets,[ID_B]);
    assert.equal(calls[1].method,'GET');
    assert.equal(calls[2].body.jobId,'a'.repeat(32));
    assert.ok(calls.every(c=>c.auth==='Bearer nv_'+'a'.repeat(64)));
  } finally { global.fetch=originalFetch; }
});

test('OAuth verification with opt-in encrypts refresh token and permits only selected target', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'novora-optin-'));
  const originalFetch=global.fetch;
  try {
    const store=makeStore(dir,crypto.randomBytes(32).toString('hex'));
    const oauth=makeOAuth({clientId:ID_A,clientSecret:'dummy',publicUrl:'https://verify.example.com',store,validateMember:async()=>{}});
    const url=new URL(oauth.begin(ID_B,[ID_C]));
    assert.equal(url.searchParams.get('scope'),'identify guilds guilds.join');
    global.fetch=async (url, options)=>{
      if (String(url).endsWith('/oauth2/token')) return {ok:true,json:async()=>({scope:'identify guilds guilds.join',access_token:'sensitive-access',refresh_token:'sensitive-refresh',expires_in:1800})};
      if (String(url).endsWith('/users/@me')) return {ok:true,json:async()=>({id:ID_A,username:'tester',global_name:'Tester',avatar:null})};
      throw Error('unexpected network request');
    };
    const verified=await oauth.complete('code',url.searchParams.get('state'));
    assert.deepEqual(verified.member.transfer.allowedTargets,[ID_C]);
    assert.notEqual(verified.member.transfer.refresh,'sensitive-refresh');
    assert.equal(store.decrypt(verified.member.transfer.refresh),'sensitive-refresh');
    assert.equal(await oauth.freshAccess(verified.member),'sensitive-access');
    await assert.rejects(oauth.complete('code',url.searchParams.get('state')),/Ungültige oder abgelaufene/);
  } finally { global.fetch=originalFetch; fs.rmSync(dir,{recursive:true,force:true}); }
});

test('Legacy verify link forwards to official Discord OAuth and rejects invalid target', async () => {
  const guilds=new Map([
    [ID_B,{id:ID_B,name:'Original Server'}],
    [ID_C,{id:ID_C,name:'Transfer Server'}]
  ]);
  guilds.filter=predicate=>{ const filtered=[...guilds.values()].filter(predicate); return {map:selector=>filtered.map(selector)}; };
  const oauth={begin:()=> 'https://discord.com/oauth2/authorize?state=unit'};
  const server=startWebsite({port:0,publicUrl:'https://verify.example.com',websiteUrl:'https://dashboard.example.com',client:{guilds:{cache:guilds}},oauth,store:{state:{guilds:{[ID_C]:{allowTransfer:true}}}},verified:async()=>{}});
  try {
    if (!server.listening) await once(server,'listening');
    const port=server.address().port;
    const page=await fetch('http://127.0.0.1:'+port+'/verify?guild='+ID_B,{redirect:'manual'});
    assert.equal(page.status,303);
    assert.match(page.headers.get('location'),/^https:\/\/discord\.com\/oauth2\/authorize/);
    const bad=await fetch('http://127.0.0.1:'+port+'/verify/start',{method:'POST',body:new URLSearchParams({guild:ID_B,target:ID_A}),headers:{'Content-Type':'application/x-www-form-urlencoded'},redirect:'manual'});
    assert.equal(bad.status,400);
    const good=await fetch('http://127.0.0.1:'+port+'/verify/start',{method:'POST',body:new URLSearchParams({guild:ID_B,target:ID_C}),headers:{'Content-Type':'application/x-www-form-urlencoded'},redirect:'manual'});
    assert.equal(good.status,303);
    assert.equal(good.headers.get('location'),'https://discord.com/oauth2/authorize?state=unit');
    const health=await fetch('http://127.0.0.1:'+port+'/health');
    assert.equal(health.status,200);
    assert.equal(await health.text(),'ok');
  } finally { await new Promise(r=>server.close(r)); }
});
