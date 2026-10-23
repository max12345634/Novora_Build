'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {isV2Message}=require('../src/message-flags');
const {refreshSavedPanel}=require('../src/panel-sync');
const Module=require('node:module');
const original=Module._load;
Module._load=function(name,...args){if(name==='discord.js')return require('./discord-stub');return original.call(this,name,...args);};
const ui=require('../src/ui-v2');
Module._load=original;
const payload=()=>({flags:32768,components:[{type:17,components:[{type:10,content:'Novora'}]}]});
function panel({flags=0,author='bot',embeds=[],id='old'}={}){
 const events=[];
 const old={id,flags,embeds,author:author?{id:author}:null,
  edit:async()=>{events.push('edit');return old;},delete:async()=>events.push('delete-old')};
 const next={id:'new',delete:async()=>events.push('delete-new')};
 const channel={messages:{fetch:async()=>old},send:async()=>{events.push('send');return next;}};
 const guild={client:{user:{id:'bot'}},channels:{fetch:async()=>channel}};
 return {events,old,channel,guild,next};
}
test('V4.10: Discord BitField and numeric message flags are recognized',()=>{
 assert.equal(isV2Message({flags:32768}),true);
 assert.equal(isV2Message({flags:{bitfield:32768n}}),true);
 assert.equal(isV2Message({flags:{has:x=>x===32768}}),true);
 assert.equal(isV2Message({flags:0}),false);
 assert.equal(isV2Message({flags:{bitfield:0n}}),false);
 assert.equal(isV2Message({flags:undefined}),false);
 assert.equal(isV2Message({flags:{has:()=>{throw Error('broken')}}}),false);
});
test('V4.10: text-only legacy panel is migrated, not edited in place',async()=>{
 const h=panel({flags:0,embeds:[]});const stored=[];
 const r=await refreshSavedPanel({guild:h.guild,channelId:'c',messageId:'old',makePayload:payload,onReplaced:async id=>stored.push(id)});
 assert.equal(r.status,'updated');assert.equal(r.migrated,true);
 assert.deepEqual(stored,['new']);assert.deepEqual(h.events,['send','delete-old']);
});
test('V4.10: V2 panel with bitfield is updated without posting a duplicate',async()=>{
 const h=panel({flags:{has:bit=>bit===32768}});
 const r=await refreshSavedPanel({guild:h.guild,channelId:'c',messageId:'old',makePayload:payload,onReplaced:async()=>{throw Error('should not store')}});
 assert.equal(r.status,'updated');assert.deepEqual(h.events,['edit']);
});
test('V4.10: unknown bot identity prevents modifying a stored panel',async()=>{
 const h=panel({flags:32768});delete h.guild.client;
 const r=await refreshSavedPanel({guild:h.guild,channelId:'c',messageId:'old',makePayload:payload,onReplaced:async()=>{}});
 assert.equal(r.status,'failed');assert.match(r.reason,/Bot-Identität/);assert.deepEqual(h.events,[]);
});
test('V4.10: missing author prevents modifying a stored panel',async()=>{
 const h=panel({flags:32768,author:null});
 const r=await refreshSavedPanel({guild:h.guild,channelId:'c',messageId:'old',makePayload:payload});
 assert.equal(r.status,'failed');assert.deepEqual(h.events,[]);
});
test('V4.10: no-id replacement is removed and old panel retained',async()=>{
 const h=panel();h.channel.send=async()=>{h.events.push('send');return {delete:async()=>h.events.push('delete-new')}};
 const r=await refreshSavedPanel({guild:h.guild,channelId:'c',messageId:'old',makePayload:payload,onReplaced:async()=>{throw Error('should not store')}});
 assert.equal(r.status,'failed');assert.deepEqual(h.events,['send','delete-new']);
});
test('V4.10: direct panel publishing also migrates text-only legacy messages',async()=>{
 const h=panel({flags:0,embeds:[]});const result=await ui.publish(h.channel,payload(),h.old);
 assert.equal(result.id,'new');assert.deepEqual(h.events,['send','delete-old']);
});
test('V4.10: direct V2 publishing edits in place',async()=>{
 const h=panel({flags:{bitfield:32768n}});const result=await ui.publish(h.channel,payload(),h.old);
 assert.equal(result.id,'old');assert.deepEqual(h.events,['edit']);
});
test('V4.10: direct publishing retains old panel when new Discord message has no ID',async()=>{
 const h=panel();h.channel.send=async()=>({delete:async()=>h.events.push('delete-new')});
 await assert.rejects(ui.publish(h.channel,payload(),h.old),/keine ID/);
 assert.deepEqual(h.events,['delete-new']);
});
test('V4.10: failed legacy cleanup reports duplicate if rollback also fails',async()=>{
 const h=panel();h.old.delete=async()=>{throw Error('Forbidden')};h.next.delete=async()=>{throw Error('Forbidden')};
 const log=console.error;console.error=()=>{};
 try{await assert.rejects(ui.publish(h.channel,payload(),h.old),/Doppelung manuell prüfen/);}
 finally{console.error=log;}
});
test('V4.10: setup consistently offers only Team-Bewerbungen',()=>{
 const oldLoad=Module._load;Module._load=function(name,...args){if(name==='discord.js')return require('./discord-stub');return oldLoad.call(this,name,...args);};
 let choices,fields;try{({choices,fields}=require('../src/setup-flow'));}finally{Module._load=oldLoad;}
 const choice=choices.find(c=>c.value==='application');
 assert.equal(choice.label,'Team-Bewerbungen');assert.match(choice.description,/Bot-DM/);
 const options=fields.panel[0].options.filter(x=>x.value==='application');
 assert.equal(options.length,1);assert.match(options[0].label,/Team-Bewerbungs/);
 assert.doesNotMatch(options[0].description,/RP-/);
});
