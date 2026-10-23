'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const native=Module._load;
Module._load=function(module,...args){if(module==='discord.js')return require('./discord-stub');return native.call(this,module,...args)};
const {ticketView,makeSupportSuite}=require('../src/support-suite');
const {fields,makeSetupFlow}=require('../src/setup-flow');
const {names}=require('../src/emoji');
const ui=require('../src/ui-v2');
Module._load=native;
const guildId='123456789012345678',userId='234567890123456789',staffId='345678901234567890';
const caseId='aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee';

test('new premium icons exist as real 128x128 transparent RGBA PNG and SVG source files',()=>{
 for(const key of ['nv_unverified','nv_critical','nv_admin','nv_members','nv_create','nv_edit','nv_delete','nv_info','nv_mute','nv_warning','nv_sync','nv_success','nv_error','nv_publicrating','nv_privaterating']){
  assert.ok(names.includes(key),key);
  const png=fs.readFileSync(path.join(__dirname,'../assets/emojis',key+'.png'));
  assert.equal(png.readUInt32BE(16),128);
  assert.equal(png.readUInt32BE(20),128);
  assert.equal(png[25],6);
  assert.ok(png.length<256*1024);
  assert.match(fs.readFileSync(path.join(__dirname,'../assets/emojis',key+'.svg'),'utf8'),/<svg/);
 }
});

test('support ticket welcome contains cleaned server identity and actions before privacy footer',()=>{
 const ticket={id:caseId,guildId,userId,kind:'question',status:'open',title:'Kurze Frage',createdAt:Date.now()};
 const p=ticketView(ticket,{},'🛰️ Shadow RP <a:test:123456789012345678>');
 const items=p.components[0].components;
 assert.match(JSON.stringify(items[0]),/Shadow RP Support/);
 assert.doesNotMatch(JSON.stringify(items[0]),/🛰️|<a:test/);
 const rowIndex=items.findIndex(c=>c.type===1);
 const privacyIndex=items.findIndex(c=>c.type===10&&c.content.includes('Transkript'));
 assert.ok(rowIndex>=0&&privacyIndex>rowIndex);
});

test('V2 edit permission error never creates duplicate public panel',async()=>{
 let created=0;
 const old={flags:32768,embeds:[],edit:async()=>{throw Error('Discord 403 Missing Permissions')}};
 await assert.rejects(ui.publish({send:async()=>{created++}},ui.payload({lines:['# Update']}),old),/Discord 403/);
 assert.equal(created,0);
});

test('legacy message migration rolls back replacement if old message deletion fails',async()=>{
 let removed=0;
 const old={embeds:[{}],delete:async()=>{throw Error('Forbidden')}};
 const ch={send:async()=>({id:'new',delete:async()=>{removed++}})};
 await assert.rejects(ui.publish(ch,ui.payload({lines:['# Neu']}),old),/Ersatzpanel zurückgenommen/);
 assert.equal(removed,1);
});

test('ticket closing first requires a private staff confirmation and does not close immediately',async()=>{
 let deleted=0;
 const mem={id:staffId,permissions:{has:()=>false},roles:{cache:new Map([['role',true]])}};
 const guild={id:guildId,ownerId:'other',members:{fetch:async()=>mem}};
 const s={supportSettings:{[guildId]:{tickets:{teamRoleId:'role'}}},supportTickets:{[caseId]:{id:caseId,guildId,status:'open',userId,channelId:'chan'}}};
 const suite=makeSupportSuite({client:{user:{id:'bot'},guilds:{cache:new Map()}},store:{state:s,persist:async()=>{deleted++}}});
 let response;
 await suite.onInteraction({customId:'nvs:tclose:'+caseId,isButton:()=>true,inGuild:()=>true,guild,guildId,user:{id:staffId},
  reply:async p=>{response=p}});
 assert.equal(deleted,0);
 assert.equal(s.supportTickets[caseId].status,'open');
 assert.ok(response.flags&64);
 assert.ok(JSON.stringify(response.components).includes('nvs:tcloseconfirm:'+caseId));
 assert.ok(JSON.stringify(response.components).includes('nvs:tclosecancel:'+caseId));
});

test('Verify setup includes optional unverified-role removal',()=>{
 assert.equal(fields.verify.length,3);
 assert.equal(fields.verify[1].key,'entfernen');
 assert.equal(fields.verify[1].optional,true);
});

test('panel overview appears before confirmation and confirmation does not run on menu selection',async()=>{
 let executed=0;const seen=[];const gid=guildId;
 const flow=makeSetupFlow(async()=>{executed++},{getPanelOverview:async g=>{assert.equal(g.id,gid);return ['• **Verify:** ✅ Gefunden','• **Tickets:** ⚠️ Gespeicherte Nachricht fehlt'];}});
 const i={guild:{id:gid},guildId:gid,user:{id:userId},inGuild:()=>true,memberPermissions:{has:()=>true},
  isStringSelectMenu:()=>true,isButton:()=>false,isChannelSelectMenu:()=>false,isRoleSelectMenu:()=>false,
  reply:async p=>seen.push(p),update:async p=>seen.push(p)};
 await flow.open(i);
 const menu=seen[0].components[0].components.find(c=>c.type===1).components[0].custom_id;
 await flow.onInteraction({...i,customId:menu,values:['panelrefresh']});
 assert.equal(executed,0);
 const str=JSON.stringify(seen.at(-1).components);
 assert.match(str,/Verify/);
 assert.match(str,/Gespeicherte Nachricht fehlt/);
 assert.match(str,/Alle Panels aktualisieren/);
});
