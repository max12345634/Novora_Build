'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {once}=require('node:events');
const {startWebsite}=require('../src/website');
const G='123456789012345678', A='234567890123456789';
function create(){
  const bridge={authorized:header=>header==='Bearer test-secret',pair:()=>({status:403,body:{error:'no pair'}}),
    snapshot:()=>({online:true}),security:{
      list:async(g,a)=>{if(g!==G||a!==A)throw Error('No audit access');return {count:1,items:[{level:'critical',summary:'Admin grant',actorId:A}]};},
      status:async(g,a)=>{if(g!==G||a!==A)throw Error('No audit access');return {ok:true,count:1,hash:'abc'};}
    }};
  return startWebsite({port:0,publicUrl:'https://test.example',websiteUrl:'https://test.example',
    bridge,client:{guilds:{cache:new Map()}},oauth:null,store:{state:{guilds:{}}},verified:async()=>{}});
}
test('security log endpoints require bridge authentication and validate guild/admin',async()=>{
  const s=create();try{
    if(!s.listening)await once(s,'listening');const base='http://127.0.0.1:'+s.address().port;
    const qs='?guildId='+G+'&adminId='+A;
    assert.equal((await fetch(base+'/api/bridge/security-logs'+qs)).status,401);
    const h={Authorization:'Bearer test-secret'};
    const valid=await fetch(base+'/api/bridge/security-logs'+qs,{headers:h});
    assert.equal(valid.status,200);assert.equal((await valid.json()).items[0].level,'critical');
    assert.equal((await fetch(base+'/api/bridge/security-logs?guildId='+G+'&adminId=555555555555555555',{headers:h})).status,403);
    assert.equal((await fetch(base+'/api/bridge/security-status'+qs,{headers:h})).status,200);
  }finally{s.close()}
});
