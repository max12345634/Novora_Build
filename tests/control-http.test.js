'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {once}=require('node:events');
const {makeBridge}=require('../src/bridge');
const {startWebsite}=require('../src/website');
const {defaults,validatePatch}=require('../src/control');
test('BotHosted settings API refuses anonymous writes, accepts pairing and persists safe live changes', async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'novora-control-api-'));
  const state={panelTitle:'Verifizierung',panelColor:'#6477ed'};
  const ops={
    read:async(guildId,adminId)=>guildId==='123456789012345678'&&adminId==='234567890123456789'
      ? {status:200,body:{ok:true,config:defaults(state),audit:[],stats:{verifiedMembers:0},version:'2.0.0'}}
      : {status:403,body:{error:'Keine Serverberechtigung'}},
    update:async({guildId,adminId,patch})=>{
      if(guildId!=='123456789012345678'||adminId!=='234567890123456789')return {status:403,body:{error:'Keine Serverberechtigung'}};
      try{Object.assign(state,validatePatch(patch));return {status:200,body:{ok:true,panelUpdated:true,config:defaults(state)}};}
      catch(e){return {status:400,body:{error:e.message}};}
    }
  };
  const bridge=makeBridge({dir,snapshot:()=>({online:true,version:'2.0.0'}),transfer:async()=>[],detail:async()=>null,roleAdmin:{},ops});
  const client={guilds:{cache:new Map()}};
  const server=startWebsite({port:0,publicUrl:'http://127.0.0.1',websiteUrl:'https://example.com',client,oauth:null,store:{state:{guilds:{}}},bridge,verified:async()=>{}});
  try{
    if(!server.listening)await once(server,'listening');
    const base='http://127.0.0.1:'+server.address().port;
    const endpoint=base+'/api/bridge/ops';
    const query='?guildId=123456789012345678&adminId=234567890123456789';
    const unsigned=await fetch(endpoint+query);assert.equal(unsigned.status,401);
    const code=bridge.newCode();
    const paired=await fetch(base+'/api/bridge/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});
    assert.equal(paired.status,200);
    const {token}=await paired.json();
    const headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'};
    const read=await fetch(endpoint+query,{headers});assert.equal(read.status,200);
    const invalid=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({guildId:'123456789012345678',adminId:'234567890123456789',patch:{roleId:'admin-role'}})});
    assert.equal(invalid.status,400);
    const save=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({guildId:'123456789012345678',adminId:'234567890123456789',patch:{panelTitle:'Berlin RP/VC',verificationPaused:true,panelDescription:'Willkommen!\nJetzt prüfen'}})});
    assert.equal(save.status,200);assert.equal((await save.json()).config.verificationPaused,true);
    const reread=await fetch(endpoint+query,{headers});assert.equal((await reread.json()).config.panelTitle,'Berlin RP/VC');
    const forbidden=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({guildId:'123456789012345678',adminId:'999999999999999999',patch:{panelTitle:'Fremd'}})});
    assert.equal(forbidden.status,403);
    const codeReused=await fetch(base+'/api/bridge/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});assert.equal(codeReused.status,403);
  }finally{server.close();fs.rmSync(dir,{recursive:true,force:true})}
});
