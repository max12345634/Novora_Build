'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {startWebsite}=require('../src/website');
const G='123456789012345678', U='234567890123456789', A='345678901234567890';
function setup(){
  const guild={id:G,name:'Novora City',iconURL:()=>null};
  const cache=new Map([[G,guild]]);
  const bridge={authorized:h=>h==='Bearer demo-secret',pair:()=>({status:403,body:{error:'No pairing'}}),snapshot:()=>({guilds:[],members:[]}),
    messages:async(g,u,a)=>{assert.deepEqual([g,u,a],[G,U,A]);return {items:[{id:U,text:'Hallo',channel:'stadt'}],note:'Live aus Discord'}},
    resolveInvite:async(code,admin)=>{assert.equal(code,'https://discord.gg/novora');assert.equal(admin,A);return {guildId:G,name:'Novora City'}},
    ops:{read:async()=>({status:403,body:{error:'Denied'}})}, roleAdmin:{}};
  const server=startWebsite({port:0,publicUrl:'https://novora.example',websiteUrl:'https://dashboard.example',bridge,client:{guilds:{cache}},store:{state:{guilds:{}}},oauth:null,verified:async()=>{}});
  return server;
}
test('Message contents and invite information cannot be requested without bridge token',async()=>{
  const server=setup();try{
    if(!server.listening)await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
    const r=await fetch(base+'/api/bridge/messages?guildId='+G+'&userId='+U+'&adminId='+A);
    assert.equal(r.status,401);
    const p=await fetch(base+'/api/bridge/resolve-invite',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({invite:'https://discord.gg/novora',adminId:A})});
    assert.equal(p.status,401);
  }finally{server.close();}
});
test('Authorized member message read and invite resolution delegate to permission-checking handlers',async()=>{
  const server=setup();try{
    if(!server.listening)await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
    const r=await fetch(base+'/api/bridge/messages?guildId='+G+'&userId='+U+'&adminId='+A,{headers:{Authorization:'Bearer demo-secret'}});
    assert.equal(r.status,200);const data=await r.json();assert.equal(data.items[0].text,'Hallo');
    const p=await fetch(base+'/api/bridge/resolve-invite',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer demo-secret'},body:JSON.stringify({invite:'https://discord.gg/novora',adminId:A})});
    assert.equal(p.status,200);assert.equal((await p.json()).guildId,G);
  }finally{server.close();}
});
