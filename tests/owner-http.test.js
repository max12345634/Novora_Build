'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{once}=require('node:events');
const {startWebsite}=require('../src/website');
const G='123456789012345678',A='234567890123456789';
function fixture(){let count=0;const bridge={authorized:t=>t==='Bearer private-test-key',pair:()=>({status:403,body:{error:'no'}}),snapshot:()=>({online:true}),
 changelog:()=>({version:'3.3.0',releases:[{version:'3.3.0',changes:['Owner alerts']}],installed:[]}),
 ownerAlerts:{get:async(g,a)=>{if(g!==G||a!==A)throw Error('Permission denied');return {ok:true,profile:{enabled:false},categories:[]}},update:async(g,a,b)=>{if(g!==G||a!==A)throw Error('Permission denied');if(!['enable','disable','mute','unmute'].includes(b.action))throw Error('Invalid');count++;return {ok:true,notice:'saved'}}}};
 const server=startWebsite({port:0,publicUrl:'https://example.net',websiteUrl:'https://example.net',client:{guilds:{cache:new Map()}},bridge,oauth:null,store:{state:{guilds:{}}},verified:async()=>{}});
 return {server,bridge,get count(){return count}};}
test('owner preferences and changelog are private routes',async()=>{const f=fixture();try{if(!f.server.listening)await once(f.server,'listening');const url='http://127.0.0.1:'+f.server.address().port;
 assert.equal((await fetch(url+'/api/bridge/changelog')).status,401);
 assert.equal((await fetch(url+'/api/bridge/owner-alerts?guildId='+G+'&adminId='+A)).status,401);
 const headers={Authorization:'Bearer private-test-key','Content-Type':'application/json'};
 const releases=await (await fetch(url+'/api/bridge/changelog',{headers})).json();assert.equal(releases.releases[0].version,'3.3.0');
 const status=await (await fetch(url+'/api/bridge/owner-alerts?guildId='+G+'&adminId='+A,{headers})).json();assert.equal(status.profile.enabled,false);
 const edited=await (await fetch(url+'/api/bridge/owner-alerts',{method:'POST',headers,body:JSON.stringify({guildId:G,adminId:A,action:'enable'})})).json();assert.equal(edited.ok,true);
 assert.equal(f.count,1);
 assert.equal((await fetch(url+'/api/bridge/owner-alerts',{method:'POST',headers,body:JSON.stringify({guildId:G,adminId:'000000000000000000',action:'enable'})})).status,403);
 assert.equal((await fetch(url+'/api/bridge/owner-alerts',{method:'POST',headers,body:JSON.stringify({guildId:G,adminId:A,action:'hack'})})).status,403);
 }finally{f.server.close()}});
