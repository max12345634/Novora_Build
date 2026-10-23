'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const {refreshSavedPanel,summarizePanels}=require('../src/panel-sync');
const Module=require('node:module');
const oldLoad=Module._load;Module._load=function(req,...args){if(req==='discord.js')return require('./discord-stub');return oldLoad.call(this,req,...args);};
const {fields,choices}=require('../src/setup-flow');
Module._load=oldLoad;
const {names}=require('../src/emoji');
const ids=['112233445566778899','223344556677889900'];
function sample(payload){return payload||{flags:32768,components:[{type:17,components:[{type:10,content:'Panel'}]}],allowedMentions:{parse:[]}}}
const guildOf=(message)=>({id:ids[0],channels:{fetch:async id=>id===ids[1]?{id,messages:{fetch:async msgId=>msgId===message.id?message:null},send:async()=>{throw Error('new message forbidden')}}:null}});
test('setup offers a single bulk panel update with no extra slash commands',()=>{
 assert.ok(choices.some(c=>c.value==='panelrefresh'));
 assert.deepEqual(fields.panelrefresh,[]);
 assert.ok(!choices.some(c=>c.value==='postall'));
 const setup=require('../src/setup-menu').setupCommand.toJSON();
 assert.equal(setup.name,'setup');assert.ok(!setup.options?.length);
});
test('18 new custom application emoji drawings are transparent, correctly sized, and small',()=>{
 const newNames=['settings','refresh','support','question','technical','close','open','forum','message','transcript','status','approved','denied','channel','release','archive','star','search'].map(x=>'nv_'+x);
 for(const name of newNames){
  assert.ok(names.includes(name));
  const file=fs.readFileSync(path.join(__dirname,'../assets/emojis',name+'.png'));
  assert.equal(file.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(file.readUInt32BE(16),128);assert.equal(file.readUInt32BE(20),128);
  assert.equal(file[25],6);assert.ok(file.length<256*1024);
  assert.ok(fs.statSync(path.join(__dirname,'../assets/emojis',name+'.svg')).size>100);
 }
});
test('bulk panel refresh edits already-published V2 in place without sending duplicates',async()=>{
 let changed=0,sent=0,stored=0;
 const msg={id:ids[0],author:{id:'bot'},flags:32768,embeds:[],edit:async payload=>{changed++;assert.equal(payload.flags,32768);}};
 const guild={id:'g',client:{user:{id:'bot'}},channels:{fetch:async()=>({messages:{fetch:async()=>msg},send:async()=>{sent++}})}};
 const r=await refreshSavedPanel({guild,channelId:'c',messageId:ids[0],makePayload:()=>sample(),onReplaced:async()=>{stored++}});
 assert.deepEqual(r,{status:'updated',id:ids[0]});
 assert.equal(changed,1);assert.equal(sent,0);assert.equal(stored,0);
});
test('bulk refresh never creates a panel if the previous message was deleted',async()=>{
 let sent=0;
 const guild={channels:{fetch:async()=>({messages:{fetch:async()=>null},send:async()=>{sent++}})}};
 const res=await refreshSavedPanel({guild,channelId:'c',messageId:'old',makePayload:()=>sample()});
 assert.equal(res.status,'failed');assert.equal(sent,0);
 assert.equal((await refreshSavedPanel({guild,channelId:null,messageId:null,makePayload:()=>sample()})).status,'skipped');
});
test('migration persists replacement ID before deleting previous legacy message',async()=>{
 const events=[];
 const old={id:'old',author:{id:'bot'},flags:0,embeds:[{title:'old'}],delete:async()=>events.push('deleted')};
 const channel={messages:{fetch:async()=>old},send:async payload=>{events.push('sent');return {id:'new',delete:async()=>events.push('rollback')}}};
 const guild={client:{user:{id:'bot'}},channels:{fetch:async()=>channel}};
 const res=await refreshSavedPanel({guild,channelId:'c',messageId:'old',makePayload:()=>sample(),onReplaced:async id=>{assert.equal(id,'new');events.push('stored')}});
 assert.equal(res.status,'updated');assert.equal(res.migrated,true);
 assert.deepEqual(events,['sent','stored','deleted']);
});
test('legacy panel migration rolls back if old message cannot be removed',async()=>{
 const events=[];
 const old={id:'old',author:{id:'bot'},flags:0,embeds:[{title:'old'}],delete:async()=>{throw Error('forbidden')}};
 const channel={messages:{fetch:async()=>old},send:async()=>({id:'new',delete:async()=>events.push('rolled-back')})};
 const result=await refreshSavedPanel({guild:{client:{user:{id:'bot'}},channels:{fetch:async()=>channel}},channelId:'c',messageId:'old',makePayload:()=>sample(),onReplaced:async id=>events.push('saved-'+id)});
 assert.equal(result.status,'failed');assert.deepEqual(events,['saved-new','saved-old','rolled-back']);
});
test('summary reports all three panels individually',()=>{
 const x=summarizePanels([['Verify',{status:'updated'}],['Partnerschaften',{status:'skipped'}],['Tickets',{status:'failed',reason:'gelöscht'}]]);
 assert.deepEqual([x.updated,x.skipped,x.failed],[1,1,1]);
 assert.ok(x.lines.some(line=>line.includes('Tickets')&&line.includes('gelöscht')));
});
test('panel refresh setup requires explicit confirm button before any update executes',async()=>{
 const {makeSetupFlow}=require('../src/setup-flow');
 const trace=[];const calls=[];
 const who='123456789012345678';
 const base={guildId:'223456789012345678',user:{id:who},inGuild:()=>true,memberPermissions:{has:()=>true},
  reply:async p=>{trace.push(p)},update:async p=>{trace.push(p)},deferUpdate:async()=>{trace.push('deferred')},editReply:async p=>{trace.push(p)},
  isButton:()=>false,isStringSelectMenu:()=>true,isChannelSelectMenu:()=>false,isRoleSelectMenu:()=>false};
 const flow=makeSetupFlow(async(i,mode)=>{calls.push(mode);await i.editReply({content:'done'});});
 await flow.open(base);
 const menu=trace[0].components[0].components.find(x=>x.type===1).components[0].custom_id;
 await flow.onInteraction({...base,customId:menu,values:['panelrefresh']});
 assert.deepEqual(calls,[],'choosing should show confirmation, not update panels');
 const confirm=trace.at(-1);
 const buttons=confirm.components[0].components.filter(x=>x.type===1).flatMap(x=>x.components);
 const accept=buttons.find(x=>x.label==='Alle Panels aktualisieren');
 assert.ok(accept);
 await flow.onInteraction({...base,isButton:()=>true,isStringSelectMenu:()=>false,customId:accept.custom_id});
 assert.deepEqual(calls,['panelrefresh']);
});
