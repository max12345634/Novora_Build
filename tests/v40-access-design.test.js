'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const previous=Module._load;
Module._load=function(name,...args){if(name==='discord.js')return require('./discord-stub');return previous.call(this,name,...args)};
const {makeSupportSuite,ticketPanel}=require('../src/support-suite');
const {makePartnerships}=require('../src/partnerships');
const {fields}=require('../src/setup-flow');
Module._load=previous;
const gid='111111111111111111',teamId='222222222222222222',requester='333333333333333333',helper='444444444444444444',cid='77777777-aaaa-4bbb-cccc-123456789012';
const makeMember=id=>({id,permissions:{has:()=>false},roles:{cache:new Map([[teamId,true]])}});
test('V4: cannot take your own ticket; assigned staff member can release it',async()=>{
 const state={supportSettings:{[gid]:{tickets:{teamRoleId:teamId}}},supportTickets:{[cid]:{id:cid,guildId:gid,userId:requester,status:'open',createdAt:1,channelId:'555555555555555555',messageId:'999',title:'Hilfe'}}};
 const members=new Map([[requester,makeMember(requester)],[helper,makeMember(helper)]]);
 const guild={id:gid,ownerId:'666666666666666666',members:{fetch:async id=>members.get(id)},channels:{fetch:async()=>null}};
 const client={user:{id:'999999999999999999'},users:{fetch:async()=>null}};
 const bot=makeSupportSuite({client,store:{state,persist:async()=>{}}});
 await assert.rejects(bot.actionTicket(guild,requester,cid,'claim'),/eigenes Ticket/);
 assert.equal(state.supportTickets[cid].status,'open');
 await bot.actionTicket(guild,helper,cid,'claim');
 assert.equal(state.supportTickets[cid].staffId,helper);
 await bot.actionTicket(guild,helper,cid,'release');
 assert.equal(state.supportTickets[cid].status,'open');
 assert.equal(state.supportTickets[cid].staffId,null);
});
test('V4: requester can ask closure but cannot force-close via staff button',async()=>{
 const state={supportSettings:{[gid]:{tickets:{teamRoleId:teamId}}},supportTickets:{[cid]:{id:cid,guildId:gid,userId:requester,status:'open',createdAt:1,channelId:'555555555555555555',title:'Hilfe'}}};
 const member={id:requester,permissions:{has:()=>false},roles:{cache:new Map()}};
 const guild={id:gid,ownerId:'666666666666666666',members:{fetch:async()=>member},channels:{fetch:async()=>null}};
 const bot=makeSupportSuite({client:{user:{id:'x'}},store:{state,persist:async()=>{}}});
 await bot.actionTicket(guild,requester,cid,'request');
 assert.equal(state.supportTickets[cid].closeRequestedBy,requester);
 await assert.rejects(bot.actionTicket(guild,requester,cid,'close'),/zuständige Server-Team/);
 assert.equal(state.supportTickets[cid].status,'open');
});
test('V4: five categories, server name, and custom emoji bindings work together',()=>{
 const menu=ticketPanel({id:gid,name:'Berlin RP'},null,0,{nv_support:'123',nv_rules:'234',nv_report:'345',nv_technical:'456',nv_team:'567'});
 const options=menu.components[1].components[0].options;
 assert.equal(options.length,5);
 assert.deepEqual(options.map(x=>x.value),['question','rules','player','technical','report']);
 assert.deepEqual(options.map(x=>x.emoji.id),['123','234','345','456','567']);
 assert.match(JSON.stringify(menu.components[0]),/Berlin RP/);
 assert.equal(fields.verify.length,3);
});
test('V4: banner images have no large image footer and archives remain included',()=>{
 for(const kind of ['tickets','partnerschaft','voice','verify']){
  const buffer=fs.readFileSync(path.join(__dirname,'..','assets','banners','novora-panel-'+kind+'.png'));
  assert.equal(buffer.readUInt32BE(16),1200);assert.equal(buffer.readUInt32BE(20),280);
 }
 assert.ok(fs.existsSync(path.join(__dirname,'../src/ticket-archive.js')));
 const source=fs.readFileSync(path.join(__dirname,'../src/partnerships.js'),'utf8');
 assert.match(source,/nvp:release/);assert.match(source,/eigen(e|e )? Partnerschaftsanfrage/);
 assert.match(source,/archiveTicket/);
});
