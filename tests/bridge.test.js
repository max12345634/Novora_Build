'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {makeBridge,isApplicationOwner}=require('../src/bridge');
const {startWebsite}=require('../src/website');
const GUILD='123456789012345678';
const USER='987654321098765432';

test('secure pairing code is random, one-use, and authorizes snapshot without OAuth', async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nvbridge-'));
  let called=0;
  const bridge=makeBridge({dir,snapshot:()=>({guilds:[{id:GUILD,name:'Demo'}],members:[{id:USER,username:'Mara'}]}),transfer:async()=>{called++;return [{userId:USER,ok:true,message:'added'}]}});
  const code=bridge.newCode();
  assert.match(code,/^\d{8}$/);
  assert.equal(bridge.pair('11111111').status,403);
  const granted=bridge.pair(code);
  assert.equal(granted.status,200);
  assert.match(granted.body.token,/^nvb_[a-f0-9]{64}$/);
  assert.equal(bridge.pair(code).status,403);
  assert.equal(bridge.authorized('Bearer '+granted.body.token),true);
  assert.equal(bridge.authorized('Bearer nvb_fake'),false);
  assert.equal(bridge.authorized('Bearer '+granted.body.token+'f'),false);
  // Simulate an API client using the actual lightweight bot HTTP server.
  const server=startWebsite({port:0,publicUrl:'https://test.example.org',websiteUrl:'https://dashboard.example.org',bridge,oauth:null,store:{state:{guilds:{},members:{}}}, client:{guilds:{cache:new Map()}},verified:async()=>{}});
  try {
    await new Promise(resolve=>server.listening?resolve():server.once('listening',resolve));
    const base='http://127.0.0.1:'+server.address().port;
    let response=await fetch(base+'/api/bridge/snapshot');assert.equal(response.status,401);
    response=await fetch(base+'/api/bridge/snapshot',{headers:{authorization:'Bearer '+granted.body.token}});assert.equal(response.status,200);
    const snapshot=await response.json();assert.equal(snapshot.members[0].username,'Mara');
    response=await fetch(base+'/api/bridge/transfer',{method:'POST',headers:{authorization:'Bearer '+granted.body.token,'content-type':'application/json'},body:JSON.stringify({guildId:'wrong',userIds:[USER]})});assert.equal(response.status,400);
    response=await fetch(base+'/api/bridge/transfer',{method:'POST',headers:{authorization:'Bearer '+granted.body.token,'content-type':'application/json'},body:JSON.stringify({guildId:GUILD,userIds:[USER]})});assert.equal(response.status,200);assert.equal(called,1);
  } finally {server.close();fs.rmSync(dir,{recursive:true,force:true});}
});


test('dashboard pairing is restricted to the Discord application owner',()=>{
  const userApp={owner:{id:'111111111111111111'}};
  assert.equal(isApplicationOwner(userApp,'111111111111111111'),true);
  assert.equal(isApplicationOwner(userApp,'222222222222222222'),false);
  const teamApp={owner:{id:'333333333333333333',ownerId:'444444444444444444'}};
  assert.equal(isApplicationOwner(teamApp,'444444444444444444'),true);
  assert.equal(isApplicationOwner(teamApp,'333333333333333333'),false);
  assert.equal(isApplicationOwner(teamApp,'222222222222222222'),false);
  assert.equal(isApplicationOwner({owner:null},'111111111111111111'),false);
  assert.equal(isApplicationOwner({},'111111111111111111'),false);
});

test('update pairing grant is persistent, single-use and revocable',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nvbridge-update-'));
  try{
    const bridge=makeBridge({dir,snapshot:()=>({})});
    const dashboard=bridge.pair(bridge.newCode('dashboard'));assert.equal(dashboard.body.updateAuthorized,false);
    const code=bridge.newCode('updates');const granted=bridge.pair(code);assert.equal(granted.body.updateAuthorized,true);assert.equal(bridge.pair(code).status,403);
    assert.equal(bridge.updateAuthority().authorized,true);
    const restarted=makeBridge({dir,snapshot:()=>({})});assert.equal(restarted.updateAuthority().authorized,true);
    restarted.revokeUpdates();assert.equal(restarted.updateAuthority().authorized,false);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('expired update pairing code is rejected and consumed',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nvbridge-expired-'));const real=Date.now;let now=1000;Date.now=()=>now;
  try{const bridge=makeBridge({dir,snapshot:()=>({})});const code=bridge.newCode('updates');now+=10*60*1000;assert.equal(bridge.pair(code).status,403);now=1001;assert.equal(bridge.pair(code).status,403);assert.equal(bridge.updateAuthority().authorized,false)}
  finally{Date.now=real;fs.rmSync(dir,{recursive:true,force:true})}
});
