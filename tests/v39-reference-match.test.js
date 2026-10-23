'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const original=Module._load;
Module._load=function(name,...args){if(name==='discord.js')return require('./discord-stub');return original.call(this,name,...args);};
const {decorate,render,serverTitle}=require('../src/panel-art');
const {ticketPanel}=require('../src/support-suite');
const {makePartnerships}=require('../src/partnerships');
const {EmbedBuilder}=require('./discord-stub');
Module._load=original;
const SIG='89504e470d0a1a0a';
const id='123456789012345678';
test('Compact panels use 1200x280 PNG with no large server-name footer',()=>{
  for(const type of ['partnerschaft','tickets','verify','voice']){
    const result=render(type,'Shadow RP');
    assert.equal(result.subarray(0,8).toString('hex'),SIG);
    assert.equal(result.readUInt32BE(16),1200);
    assert.equal(result.readUInt32BE(20),280);
  }
  assert.equal(serverTitle('✨ Berlin RP 🌟'),'Berlin RP');
  assert.equal(JSON.parse(fs.readFileSync(path.join(__dirname,'..','package.json'))).dependencies['sharp'],undefined);
});
test('Panels keep server title in embed, artwork is reusable across guilds',()=>{
 const a=render('partnerschaft','Shadow RP'),b=render('partnerschaft','Berlin RP');
 assert.deepEqual(a,b);
 const guild={id:'123456789012345678',name:'Berlin RP'};
 assert.match(JSON.stringify(ticketPanel(guild,{},0).components[0]),/Berlin RP/);
});
test('Panel edits replace outdated artwork cleanly',()=>{
 const obj=()=>({embeds:[new EmbedBuilder()],components:[]});
 const old={attachments:new Map([['a',{name:'novora-panel-partnerschaft.png'}]])};
 const next=decorate(obj(),'partnerschaft',old,'Berlin RP');
 assert.deepEqual(next.attachments,[]);
 assert.equal(next.files.length,1);
 assert.equal(next.files[0].file.readUInt32BE(20),280);
});
test('Partnership status is based on real open tickets not fictional capacity',()=>{
  const store={state:{partnershipTickets:{a:{guildId:id,kind:'apply',status:'open'},b:{guildId:id,kind:'change',status:'claimed'},c:{guildId:'other',kind:'apply',status:'open'}},partnershipRecords:{},appEmojis:{nv_partner:'999999999999999999'}}};
  const {panelEmbed,panelComponents}=require('../src/partnerships');
  // Partner embeds are exercised through the module's test exports (see below).
  const {partnerPanel}=require('../src/partnerships');
  assert.doesNotMatch(JSON.stringify(partnerPanel({id,name:'Dresden City'},store).components),/offene Anfragen/);
  assert.match(JSON.stringify(partnerPanel({id,name:'Dresden City'},store).components),/Partnerschaft beantragen/);
  assert.equal(partnerPanel({id,name:'Dresden City'},store).flags,32768);
});
test('Support dropdown includes real application emojis when installed',()=>{
  const p=ticketPanel({id,name:'Shadow RP'},{},2,{nv_support:'999999999999999999',nv_technical:'888888888888888888'});
  assert.equal(p.components[1].components[0].options[0].emoji.id,'999999999999999999');
  assert.match(JSON.stringify(p.components[0]),/Shadow RP/);
});
