'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module'),path=require('node:path');
const prev=Module._load;Module._load=function(request,...args){if(request==='discord.js')return require('./discord-stub');return prev.call(this,request,...args);};
const {ticketPanel,ticketView,voiceNotice}=require('../src/support-suite');
const {partnerPanel,partnerTicketView,partnerPanelMessage}=require('../src/partnerships');
const {decorate}=require('../src/panel-art');const ui=require('../src/ui-v2');
Module._load=prev;
const guild={id:'123456789012345678',name:'Dresden City'};
const emojis={nv_ticket:'123456789012345678',nv_support:'123456789012345678',nv_technical:'423456789012345678',nv_rules:'223456789012345678',nv_report:'323456789012345678',nv_wait:'423456789012345678',nv_team:'523456789012345678',nv_partner:'623456789012345678'};
function inspect(p){
 assert.equal(p.flags,32768);
 assert.equal(p.content,undefined);
 assert.equal(p.embeds,undefined);
 assert.equal(p.components[0].type,17);
 const found=[];function visit(x){found.push(x.type);for(const c of x.components||[])visit(c);}
 p.components.forEach(visit);
 assert.ok(found.includes(10));
 return found;
}
test('Support panel renders native V2 container, image, and dropdown with five custom categories',()=>{
 const p=ticketPanel(guild,{},2,emojis);const types=inspect(p);
 assert.ok(types.includes(12));assert.ok(types.includes(14));
 assert.equal(p.components[1].components[0].options.length,5);
 assert.deepEqual(p.components[1].components[0].options.map(x=>x.emoji.id),Object.values(emojis).slice(0,5).length?[
 '123456789012345678','223456789012345678','323456789012345678','423456789012345678','523456789012345678']:[]);
 assert.match(JSON.stringify(p.components),/Dresden City/);
 const decorated=decorate(p,'tickets');assert.equal(decorated.files.length,1);
});
test('Ticket opening and status redraw is native V2 with private buttons and graphic',()=>{
 const ticket={id:'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee',guildId:guild.id,userId:'234567890123456789',status:'open',createdAt:Date.now(),kind:'question',title:'Hallo',description:'Test'};
 const p=ticketView(ticket,emojis);const types=inspect(p);
 assert.ok(types.includes(12));assert.ok(types.includes(1));
 assert.match(JSON.stringify(p.components),/Willkommen im Support/);
 assert.ok(JSON.stringify(p.components).includes('nvs:tclaim:'));
});
test('Partnership panel and case share consistent V2 card system',()=>{
 const store={state:{appEmojis:emojis,partnershipTickets:{},partnershipRecords:{}}};
 const panel=partnerPanelMessage(guild,store);inspect(panel);
 assert.equal(panel.components[1].components[0].options.flat().length,3);
 const ticket={id:'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee',kind:'apply',status:'open',requesterId:'234567890123456789',createdAt:Date.now(),form:{server:'Dresden City',invite:'https://discord.gg/abcdef',members:120,advert:'Es ist ein Community Server.'}};
 inspect(partnerTicketView(guild,ticket,store));
});
test('Voice card changes current state in-place with button, no legacy embeds',()=>{
 const c={id:'a',createdAt:Date.now()-5000,userId:'234567890123456789',status:'waiting'};
 const p=voiceNotice(c,guild.id,emojis);inspect(p);
 assert.ok(JSON.stringify(p.components).includes('nvs:vclaim:'));
 c.status='active';c.staffId='334567890123456789';c.roomId='444567890123456789';c.startedAt=Date.now();
 const active=voiceNotice(c,guild.id,emojis);inspect(active);
 assert.ok(JSON.stringify(active.components).includes('nvs:vclose:'));
});
test('V2 messages have no embeds/content and do not exceed Discord per-container component limits',()=>{
 const p=ui.payload({lines:['# Ticket','Hello'],banner:'novora-ticket-open.png',rows:[[{type:2,style:1,label:'Test',custom_id:'test'}]],after:['Thanks']});
 inspect(p);assert.ok(p.components[0].components.length<=10);
});
test('Legacy embed message is replaced, then its old copy is deleted',async()=>{
 let sent=0,deleted=0;
 const channel={send:async value=>{sent++;inspect(value);return {id:'new-card'};}};
 const prevMessage={id:'old-card',embeds:[{title:'old'}],delete:async()=>{deleted++;},edit:async()=>{throw Error('Legacy cannot upgrade')}};
 const result=await ui.publish(channel,ui.payload({lines:['# Premium']}),prevMessage);
 assert.equal(result.id,'new-card');assert.equal(sent,1);assert.equal(deleted,1);
});
test('Existing V2 message is edited in place and no duplicate is sent',async()=>{
 let sent=0,edited=0;
 const channel={send:async()=>{sent++}};
 const prevMessage={id:'v2-card',flags:32768,embeds:[],edit:async value=>{inspect(value);edited++;return {id:'v2-card'}}};
 const result=await ui.publish(channel,ui.payload({lines:['# Premium']}),prevMessage);
 assert.equal(result.id,'v2-card');assert.equal(edited,1);assert.equal(sent,0);
});
test('Version source exposes a stable semantic version for the dashboard',()=>{
 assert.equal(require('../src/control').VERSION,require('../package.json').version);
});
