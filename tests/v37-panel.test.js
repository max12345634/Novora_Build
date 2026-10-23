'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),Module=require('node:module');
const load=Module._load;Module._load=function(name,...rest){if(name==='discord.js')return require('./discord-stub');return load.call(this,name,...rest)};
const {decorate}=require('../src/panel-art');const {ticketPanel}=require('../src/support-suite');
Module._load=load;
const root=path.join(__dirname,'../assets/banners');
test('All four clean banner PNGs exist and are legitimate PNG files',()=>{
 for(const kind of ['verify','tickets','partnerschaft','voice']){
  const f=fs.readFileSync(path.join(root,'novora-panel-'+kind+'.png'));
  assert.ok(f.length>6000);assert.equal(f.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 }
});
test('Panel artwork is replaced on edit so the server branding stays current',()=>{
 const {EmbedBuilder}=require('./discord-stub');
 const make=()=>({embeds:[new EmbedBuilder()],components:[]});
 const fresh=decorate(make(),'tickets');assert.equal(fresh.files.length,1);
 assert.equal(fresh.embeds[0].data.image.url,'attachment://novora-panel-tickets.png');
 const old={attachments:new Map([['some',{name:'novora-panel-tickets.png'}]])};
 const edit=decorate(make(),'tickets',old);assert.equal(edit.files.length,1);assert.deepEqual(edit.attachments,[]);
 const legacy={attachments:new Map([['old',{name:'old-banner.png'}]])};
 const changed=decorate(make(),'tickets',legacy);assert.deepEqual(changed.attachments,[]);
});
test('Ticket and partnership menus reset before showing another modal',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../src/support-suite.js'),'utf8');
 const p=fs.readFileSync(path.join(__dirname,'../src/partnerships.js'),'utf8');
 assert.ok(s.includes('await i.message.edit({components:latest.components,flags:ui.FLAG})'));
 assert.ok(p.includes('await interaction.message.edit({components:partnerPanelMessage(interaction.guild,store).components,flags:ui.FLAG})'));
 assert.match(s,/await i.showModal\(ticketModal/);
 assert.ok(s.indexOf('await i.showModal(ticketModal')<s.indexOf('await i.message.edit({components:latest.components,flags:ui.FLAG})'));
 assert.match(p,/await interaction.showModal\(buildModal/);
 assert.ok(p.indexOf('await interaction.showModal(buildModal')<p.indexOf('await interaction.message.edit({components:partnerPanelMessage(interaction.guild,store).components,flags:ui.FLAG})'));
});
test('Support embed remains readable and has all five ticket types',()=>{
 const p=ticketPanel({id:'123456789012345678',name:'Dresden City',iconURL:()=>null},{},2);
 assert.equal(p.components[1].components[0].options.length,5);
 assert.match(JSON.stringify(p.components[0]),/Dresden City/);
});
