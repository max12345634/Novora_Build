'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {startWebsite}=require('../src/website');
const {once}=require('node:events');
const G='123456789012345678'; const U='987654321098765432';
test('control endpoint requires bridge secret and rejects unsolicited config writes',async()=>{
 const server=startWebsite({port:0,publicUrl:'https://example.org',websiteUrl:'https://example.org',client:{guilds:{cache:new Map()}},store:{state:{guilds:{}}},oauth:null,verified:async()=>{},bridge:{authorized:x=>x==='Bearer nvb_secret',ops:{read:async(g,a)=>g===G&&a===U?{status:200,body:{ok:true,guildId:G,config:{panelTitle:'Hi'}}}:{status:403,body:{error:'Not server admin'}},update:async b=>b.guildId===G&&b.adminId===U?{status:200,body:{ok:true}}:{status:403,body:{error:'Forbidden'}}}}});
 try{
  if(!server.listening)await once(server,'listening');let base='http://127.0.0.1:'+server.address().port;
  let r=await fetch(base+'/api/bridge/ops?guildId='+G+'&adminId='+U);assert.equal(r.status,401);
  r=await fetch(base+'/api/bridge/ops?guildId='+G+'&adminId='+U,{headers:{authorization:'Bearer nvb_secret'}});assert.equal(r.status,200); assert.equal((await r.json()).config.panelTitle,'Hi');
  r=await fetch(base+'/api/bridge/ops',{method:'POST',headers:{authorization:'Bearer nvb_secret','content-type':'application/json'},body:JSON.stringify({guildId:G,adminId:'111111111111111111',patch:{allowTransfer:true}})});assert.equal(r.status,403);
  r=await fetch(base+'/api/bridge/ops',{method:'POST',headers:{authorization:'Bearer nvb_secret','content-type':'application/json'},body:JSON.stringify({guildId:G,adminId:U,patch:{allowTransfer:true}})});assert.equal(r.status,200);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
