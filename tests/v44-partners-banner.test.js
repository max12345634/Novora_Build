'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const before=Module._load;
Module._load=function(request,...args){if(request==='discord.js')return require('./discord-stub');return before.call(this,request,...args);};
const {partnerTicketView,partnerBanner,buildModal,validateForm}=require('../src/partnerships');
const {TEAM_STEPS,TYPES}=require('../src/community-suite');
Module._load=before;
const guild={id:'111111111111111111',name:'⚡ Berlin RP'};
const store={state:{appEmojis:{}}};
const record=kind=>({id:'b72a89ce-4719-4c61-9ca7-a074443e81e5',kind,status:'open',requesterId:'222222222222222222',form:{server:'Muster RP',invite:'https://discord.gg/abcDEF',members:35,advert:'Testwerbung'},analysis:null});
test('three partnership operations use distinct V2 cards and matching independent image assets',()=>{
 const names=new Set();
 for(const kind of ['apply','change','cancel']){
  const img=partnerBanner(kind);names.add(img);
  const bytes=fs.readFileSync(path.join(__dirname,'../assets/banners',img));
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(bytes.readUInt32BE(16),1200);
  assert.equal(bytes.readUInt32BE(20),280);
  const output=partnerTicketView(guild,record(kind),store);
  assert.equal(output.flags,32768);assert.match(JSON.stringify(output.components),new RegExp(img));
  assert.match(JSON.stringify(output.components),/nvp:evidence/);
  assert.match(JSON.stringify(output.components),/Berlin RP/);
 }
 assert.equal(names.size,3);
});
test('partner request/change/cancel forms ask only the appropriate questions without requesting irrelevant fields',()=>{
 assert.deepEqual(buildModal(guild.id,'apply').components.map(x=>x.components[0].data.custom_id),['server','invite','members','advert']);
 assert.deepEqual(buildModal(guild.id,'change').components.map(x=>x.components[0].data.custom_id),['server','invite','members','advert']);
 assert.deepEqual(buildModal(guild.id,'cancel').components.map(x=>x.components[0].data.custom_id),['server','extra']);
 assert.ok(validateForm('cancel',{server:'Muster RP',extra:'Wir hören auf'}).server);
 assert.ok(validateForm('change',{server:'Muster RP',invite:'',members:'',advert:''}).server);
 assert.throws(()=>validateForm('apply',{server:'Muster RP',invite:'',members:'12',advert:'Unser RP-Server hat tolle Leute.'}),/Discord-Einladung erforderlich/);
});
test('only staff applicants have a DM conversation; no RP, police, or emergency template remains selectable',()=>{
 assert.deepEqual(Object.keys(TYPES),['staff']);
 assert.equal(TEAM_STEPS.length,5);
 assert.deepEqual(TEAM_STEPS.map(x=>x[0]),['profile','motivation','experience','scenarios','availability']);
});
