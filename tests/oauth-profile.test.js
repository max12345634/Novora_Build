'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {once}=require('node:events');
const {startWebsite}=require('../src/website');
const id1='123456789012345678',id2='987654321098765432',id3='112233445566778899';
test('Optional OAuth button opens Discord authorization with eligible targets in one click', async()=>{
 const guilds=new Map([[id1,{id:id1,name:'Community A'}],[id2,{id:id2,name:'Community B'}],[id3,{id:id3,name:'Closed C'}]]);
 guilds.filter=fn=>{let items=[...guilds.values()].filter(fn);return {map:cb=>items.map(cb)}};
 let seen=[];
 const server=startWebsite({port:0,publicUrl:'https://verify.example.com',websiteUrl:'https://dashboard.example.com',client:{guilds:{cache:guilds}},store:{state:{guilds:{[id2]:{allowTransfer:true},[id3]:{allowTransfer:false}}}},oauth:{begin:(source,targets)=>{seen=[source,targets];return 'https://discord.com/oauth2/authorize?scope=identify%20guilds.join'}},bridge:{authorized:()=>false},verified:async()=>{}});
 try{if(!server.listening)await once(server,'listening');const r=await fetch(`http://127.0.0.1:${server.address().port}/oauth/start?guild=${id1}`,{redirect:'manual'});assert.equal(r.status,303);assert.equal(new URL(r.headers.get('location')).hostname,'discord.com');assert.deepEqual(seen,[id1,[id2]]);}finally{await new Promise(r=>server.close(r));}
});
test('Protected member-detail API rejects requests without authenticated bot bridge key',async()=>{
 const guilds=new Map();const server=startWebsite({port:0,publicUrl:'https://verify.example.com',websiteUrl:'https://dashboard.example.com',client:{guilds:{cache:guilds}},store:{state:{guilds:{}}},oauth:null,bridge:{authorized:()=>false,detail:async()=>({id:id1})},verified:async()=>{}});
 try{if(!server.listening)await once(server,'listening');const r=await fetch(`http://127.0.0.1:${server.address().port}/api/bridge/member?userId=${id1}`);assert.equal(r.status,401);const j=await r.json();assert.match(j.error,/Nicht autorisiert/);}finally{await new Promise(r=>server.close(r));}
});
test('Bridge member detail returns limited metadata (no messages content)',async()=>{
 const guilds=new Map();let calls=0;const server=startWebsite({port:0,publicUrl:'https://verify.example.com',websiteUrl:'https://dashboard.example.com',client:{guilds:{cache:guilds}},store:{state:{guilds:{}}},oauth:null,bridge:{authorized:a=>a==='Bearer good',detail:async()=>{calls++;return {id:id1,guilds:[{id:id2,recent:[{id:id3,at:Date.now(),url:'https://discord.com/channels/'+id2+'/'+id3+'/'+id3}]}]};}},verified:async()=>{}});
 try{if(!server.listening)await once(server,'listening');const root='http://127.0.0.1:'+server.address().port;const r=await fetch(root+'/api/bridge/member?userId='+id1,{headers:{Authorization:'Bearer good'}});assert.equal(r.status,200);const j=await r.json();assert.equal(j.member.guilds.length,1);assert.equal(j.member.guilds[0].recent[0].content,undefined);assert.equal(calls,1);}finally{await new Promise(r=>server.close(r));}
});
test('OAuth approval can be revoked via Discord endpoint without exposing stored credentials',async()=>{
 const {makeOAuth}=require('../src/oauth');
 const store={decrypt:token=>token==='enc-refresh'?'real-refresh':'',state:{members:{}}};
 const oauth=makeOAuth({clientId:id1,clientSecret:'secret',publicUrl:'https://verify.example.com',store});
 const old=global.fetch;let call=null;
 try{global.fetch=async(url,opts)=>{call={url,method:opts.method,body:String(opts.body)};return {ok:true}};
 assert.equal(await oauth.revoke({transfer:{refresh:'enc-refresh'}}),true);
 assert.ok(call.url.endsWith('/oauth2/token/revoke'));
 assert.equal(call.method,'POST');
 assert.match(call.body,/token=real-refresh/);
 }finally{global.fetch=old}
});
