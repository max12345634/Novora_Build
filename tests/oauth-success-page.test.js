'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {startWebsite}=require('../src/website');
const uid='123456789012345678';
async function fixture({roleFailure=false}={}) {
  const guilds=new Map([[uid,{id:uid,name:'Testserver'}]]);
  let called=0;
  const server=startWebsite({
    port:0,
    publicUrl:'https://verify.example.com',
    websiteUrl:'https://admin.only.example.com/private',
    client:{guilds:{cache:guilds}},
    oauth:{complete:async()=>({member:{id:uid,displayName:'Person'},guildId:uid,joined:true})},
    store:{state:{guilds:{}}},
    bridge:{authorized:()=>false},
    verified:async()=>{called++;if(roleFailure)throw Error('Insufficient permissions')}
  });
  if(!server.listening)await once(server,'listening');
  return {server,port:server.address().port,calls:()=>called};
}
test('OAuth success renders a private, non-redirecting completion page',async()=>{
  const {server,port,calls}=await fixture();
  try {
    const response=await fetch(`http://127.0.0.1:${port}/oauth/callback?code=test&state=test`,{redirect:'manual'});
    assert.equal(response.status,200);
    assert.equal(response.headers.get('location'),null);
    const html=await response.text();
    assert.match(html,/Erfolgreich verifiziert/);
    assert.match(html,/Du kannst diese Seite jetzt schließen/);
    assert.doesNotMatch(html,/admin\.only\.example\.com|Zum Dashboard|Member-Transfer|Dashboard öffnen/);
    assert.equal(calls(),1);
    assert.equal(response.headers.get('cache-control'),'no-store');
  }finally{await new Promise(resolve=>server.close(resolve))}
});
test('Role permission failure preserves helpful message but exposes no admin link',async()=>{
  const {server,port,calls}=await fixture({roleFailure:true});
  try {
    const response=await fetch(`http://127.0.0.1:${port}/oauth/callback?code=test&state=test`);
    assert.equal(response.status,200);
    const html=await response.text();
    assert.match(html,/Rolle konnte nicht automatisch vergeben werden/);
    assert.doesNotMatch(html,/admin\.only\.example\.com|Zum Dashboard/);
    assert.equal(calls(),1);
  }finally{await new Promise(resolve=>server.close(resolve))}
});
