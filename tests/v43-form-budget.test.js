'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');const original=Module._load;
Module._load=function(name,...args){if(name==='discord.js')return require('./discord-stub');return original.call(this,name,...args)};
const {batches,sendPrivateForm}=require('../src/form-messages');
const {ticketCard}=require('../src/community-suite');
Module._load=original;
const gid='123456789012345678';
test('very long form answers are split without losing text or exceeding Discord V2 budgets',async()=>{
 const lines=['# Formular',...Array.from({length:5},(_,i)=>'**Frage '+i+'**\n'+'█'.repeat(1800))];
 const groups=batches(lines);
 assert.ok(groups.length>=3);
 assert.deepEqual(groups.flat(),lines);
 assert.ok(groups.every(g=>g.join('').length<=3500&&g.length<=8));
 const outgoing=[];
 await sendPrivateForm({send:async p=>{outgoing.push(p)}},lines);
 assert.equal(outgoing.length,groups.length);
 for(const p of outgoing){
  assert.equal(p.flags,32768);
  const c=p.components[0].components;
  assert.ok(c.length<=10);
  assert.ok(c.filter(x=>x.type===10).reduce((n,x)=>n+x.content.length,0)<4000);
 }
});
test('Community ticket overview is compact despite long answers',()=>{
 const record={id:'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee',guildId:gid,userId:'234567890123456789',system:'faction',type:'legal',status:'open',staffId:null,
  answers:Object.fromEntries(Array.from({length:5},(_,i)=>['field'+i,'x'.repeat(1300)]))};
 const p=ticketCard({id:gid,name:'Berlin RP'},record,{state:{appEmojis:{}}});
 assert.ok(p.components[0].components.length<=10);
 assert.ok(p.components[0].components.filter(c=>c.type===10).reduce((v,c)=>v+c.content.length,0)<4000);
});
test('Closed decision shows protected archive-and-close button',()=>{
 const record={id:'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee',guildId:gid,userId:'234567890123456789',system:'application',type:'rp',status:'approved',staffId:'345678901234567890',answers:{profile:'Applicant'}};
 const p=ticketCard({id:gid,name:'Berlin RP'},record,{state:{appEmojis:{}}});
 assert.match(JSON.stringify(p.components),/nvc:close/);
});
