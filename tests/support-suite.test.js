'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Module=require('node:module');const nativeLoad=Module._load;const discord=require('./discord-stub');Module._load=function(request,...args){if(request==='discord.js')return discord;return nativeLoad.call(this,request,...args)};
const {ChannelType}=discord;
const {makeSupportSuite,ticketConfig,voiceConfig,staff,ticketPanel,voiceNotice,ratingModal,stars}=require('../src/support-suite');
const {setupCommand}=require('../src/setup-menu');Module._load=nativeLoad;
const ID='123456789012345678',USER='234567890123456789',ADMIN='345678901234567890',ROLE='456789012345678901';
function mk(){const state={},store={state,persist:async()=>{}};const channels=new Map();const members=new Map();const guild={id:ID,ownerId:ADMIN,name:'Dresden City',members:{fetch:async id=>members.get(id)||null,fetchMe:async()=>({permissions:{has:()=>true}})},channels:{cache:channels,fetch:async id=>channels.get(id)||null,create:async payload=>{const c={id:String(Math.random()).slice(2).padEnd(18,'0').slice(0,18),type:payload.type,name:payload.name,parentId:payload.parent, members:new Map(),messages:{fetch:async()=>null},delete:async()=>{channels.delete(c.id)},permissionOverwrites:{edit:async()=>{}},send:async()=>({id:'567890123456789012'})};channels.set(c.id,c);return c}},iconURL:()=>null};
 const client={user:{id:'567890123456789012'},users:{fetch:async()=>({send:async()=>{}})},guilds:{cache:new Map([[ID,guild]])}};
 const mod=makeSupportSuite({client,store});return{state,store,mod,guild,members,channels};}
test('unified /setup is one top-level command and has necessary system options',()=>{
 const s=setupCommand.toJSON();assert.equal(s.name,'setup');const subs=(s.options||[]).map(x=>x.name);
 // Categories are selected inside the ephemeral setup menu, not slash subcommands.
 assert.equal(subs.length,0);
});
test('configuration rejects missing or mismatched channel types',()=>{
 const text={id:'1',type:ChannelType.GuildText},cat={id:'2',type:ChannelType.GuildCategory},voice={id:'3',type:ChannelType.GuildVoice};
 assert.ok(ticketConfig({panel:text,category:cat,team:{id:ROLE}}).categoryId==='2');
 assert.throws(()=>ticketConfig({panel:voice,category:cat,team:{id:ROLE}}));
 assert.throws(()=>voiceConfig({waiting:voice,notification:text,template:voice,team:{id:ROLE}}));
 const v=voiceConfig({waiting:voice,notification:text,template:{...voice,id:'4'},team:{id:ROLE}});assert.equal(v.waitingId,'3');
});
test('staff/owner access is protected; @everyone alone does not count as support staff',()=>{
 const guild={ownerId:ADMIN};assert.equal(staff({id:ADMIN,permissions:{has:()=>false}},guild,ROLE),true);
 assert.equal(staff({id:USER,permissions:{has:()=>false},roles:{cache:new Map()}},guild,ROLE),false);
 assert.equal(staff({id:USER,permissions:{has:()=>false},roles:{cache:new Map([[ROLE,true]])}},guild,ROLE),true);
});
test('support ticket panel is clean and limits mentions',()=>{
 const x=ticketPanel({id:ID,name:'Dresden City',iconURL:()=>null},{},2);
 assert.match(JSON.stringify(x.components[0]),/Dresden City/);assert.equal(x.components[1].components[0].options.length,5);assert.equal(x.flags,32768);
 assert.deepEqual(x.allowedMentions,{parse:[]});
});
test('voice support announcement updates original waiting message state and relative time',()=>{
 const waiting={id:'abcdef',createdAt:Date.now()-30000,userId:USER,status:'waiting'};
 const active={...waiting,status:'active',staffId:ADMIN,roomId:'222222222222222222',startedAt:Date.now()};
 const a=voiceNotice(waiting,ID),b=voiceNotice(active,ID);
 assert.match(JSON.stringify(a.components),/Wartet auf Support/);
 assert.match(JSON.stringify(b.components),/Im Gespräch/);
 assert.ok(a.components[0].components.some(x=>x.type===1));
 assert.ok(b.components[0].components.some(x=>x.type===1));
 assert.ok(JSON.stringify(a.components).includes(':R>'));
});
test('rating modal has correct public vs private fields and stars bounded',()=>{
 assert.equal(ratingModal('x','public').components.length,2);
 assert.equal(ratingModal('x','private').components.length,3);
 assert.equal(stars(5),'★★★★★');
});
test('dashboard support snapshot is admin-only and server-scoped',async()=>{
 const {mod,state,members}=mk();members.set(ADMIN,{id:ADMIN,permissions:{has:()=>true}});
 state.supportTickets={a:{id:'a',guildId:ID,status:'open'},b:{id:'b',guildId:'9',status:'closed'}};
 const result=await mod.snapshot(ID,ADMIN);assert.equal(result.tickets.length,1);assert.equal(result.statistics.openTickets,1);
 await assert.rejects(mod.snapshot(ID,USER),/Administratoren/);
});
test('dashboard cannot close arbitrary tickets or act on the wrong server',async()=>{
 const {mod,members}=mk();members.set(ADMIN,{id:ADMIN,permissions:{has:()=>true}});
 await assert.rejects(mod.dashboardAction(ID,ADMIN,'ticket','unknown','close'),/nicht gefunden/);
 await assert.rejects(mod.dashboardAction('999999999999999999',ADMIN,'ticket','unknown','close'),/nicht erreichbar/);
});
test('voice flow joins waiting room, claims once, edits one notification, and closes after requester leaves',async()=>{
 const {mod,guild,state,members,channels}=mk();
 const waitId='111111111111111111',notifyId='222222222222222222',templateId='333333333333333333';
 const waiting={id:waitId,type:ChannelType.GuildVoice,name:'Warteraum',parentId:'444444444444444444',members:new Map()};
 const template={id:templateId,type:ChannelType.GuildVoice,name:'Support 01',parentId:'444444444444444444',bitrate:64000,userLimit:2,members:new Map()};
 const sent={id:'888888888888888888',updates:0,edit:async function(){this.updates++}};
 const notify={id:notifyId,type:ChannelType.GuildText,messages:{fetch:async()=>sent},send:async()=>sent};
 channels.set(waitId,waiting);channels.set(templateId,template);channels.set(notifyId,notify);
 state.supportSettings[ID]={voice:{waitingId:waitId,notificationId:notifyId,templateId:templateId,teamRoleId:ROLE}};
 const makeMember=(id,channelId)=>({id,permissions:{has:()=>false},roles:{cache:new Map(id===ADMIN?[[ROLE,true]]:[])},voice:{channelId,
  setChannel:async function(target){const next=typeof target==='string'?target:target?.id||null;
    for(const ch of channels.values())ch.members?.delete(id);
    this.channelId=next;if(next)channels.get(next)?.members?.set(id,true);
  }}});
 const user=makeMember(USER,waitId),helper=makeMember(ADMIN,templateId);
 members.set(USER,user);members.set(ADMIN,helper);waiting.members.set(USER,true);template.members.set(ADMIN,true);
 await mod.onVoiceStateUpdate({id:USER,guild,channelId:null},{id:USER,guild,channelId:waitId,member:{user:{bot:false}}});
 const c=Object.values(state.supportVoiceCases)[0];assert.equal(c.status,'waiting');assert.ok(c.messageId);
 const r=await mod.claimVoice(guild,ADMIN,c.id);assert.equal(r.ok,true);assert.equal(c.status,'active');assert.equal(user.voice.channelId,c.roomId);
 assert.equal(helper.voice.channelId,c.roomId);assert.equal(sent.updates,1);
 await assert.rejects(mod.claimVoice(guild,ADMIN,c.id),/wartet nicht mehr/);
 const oldChannel=c.roomId;await user.voice.setChannel(null);
 await mod.onVoiceStateUpdate({id:USER,guild,channelId:oldChannel},{id:USER,guild,channelId:null,member:{user:{bot:false}}});
 assert.equal(c.status,'closed');assert.equal(sent.updates,2);
 assert.equal(channels.has(oldChannel),false);
});
test('web bridge routes cannot be used without authorization, including support actions',()=>{
 const fs=require('node:fs');const s=fs.readFileSync(require('node:path').join(__dirname,'../src/website.js'),'utf8');
 const auth=s.indexOf('if(!bridge.authorized(req.headers.authorization))');
 for(const url of ["'/api/bridge/support'","'/api/bridge/support/action'"])assert.ok(s.indexOf(url)>auth);
 assert.ok(s.includes('bridge.support.snapshot(')&&s.includes('bridge.support.dashboardAction('));
});

test('two rapid voice state notifications for one user create only one support card',async()=>{
 const {mod,guild,state,members,channels}=mk();
 const waitId='111111111111111111',notifyId='222222222222222222',templateId='333333333333333333';
 let sends=0;
 const firstMessage={id:'888888888888888888',edit:async()=>{}};
 channels.set(waitId,{id:waitId,type:ChannelType.GuildVoice,name:'Warten'});
 channels.set(templateId,{id:templateId,type:ChannelType.GuildVoice,name:'Support 01'});
 channels.set(notifyId,{id:notifyId,type:ChannelType.GuildText,
   send:async()=>{sends++;await new Promise(r=>setTimeout(r,12));return firstMessage;}});
 state.supportSettings[ID]={voice:{waitingId:waitId,notificationId:notifyId,templateId,teamRoleId:ROLE}};
 members.set(USER,{id:USER,voice:{channelId:waitId}});
 const a={id:USER,guild,channelId:null};const b={id:USER,guild,channelId:waitId,member:{user:{bot:false}}};
 await Promise.all([mod.onVoiceStateUpdate(a,b),mod.onVoiceStateUpdate(a,b)]);
 assert.equal(sends,1);assert.equal(Object.keys(state.supportVoiceCases).length,1);
});

test('when requester leaves during send, voice waiting notice is cancelled instead of left actionable',async()=>{
 const {mod,guild,state,members,channels}=mk();
 const waitId='111111111111111111',notifyId='222222222222222222',templateId='333333333333333333';
 const edits=[];const m={id:'888888888888888888',edit:async p=>{edits.push(p)}};
 channels.set(waitId,{id:waitId,type:ChannelType.GuildVoice,name:'Warten'});
 channels.set(notifyId,{id:notifyId,type:ChannelType.GuildText,send:async()=>{members.get(USER).voice.channelId=null;return m;}});
 state.supportSettings[ID]={voice:{waitingId:waitId,notificationId:notifyId,templateId,teamRoleId:ROLE}};
 members.set(USER,{id:USER,voice:{channelId:waitId}});
 await mod.onVoiceStateUpdate({id:USER,guild,channelId:null},{id:USER,guild,channelId:waitId,member:{user:{bot:false}}});
 assert.equal(Object.values(state.supportVoiceCases)[0].status,'cancelled');
 assert.equal(edits.length,1);assert.match(JSON.stringify(edits[0].components),/Anfrage verlassen/);
});

test('emoji initialization is chosen in /setup menu, not a separate slash command',()=>{
 const cmd=setupCommand.toJSON();assert.equal(cmd.name,'setup');assert.equal(cmd.options,undefined);
 const flow=require('node:fs').readFileSync(require('node:path').join(__dirname,'../src/setup-flow.js'),'utf8');
 assert.ok(flow.includes("value:'emojis'"));
 const src=require('node:fs').readFileSync(require('node:path').join(__dirname,'../src/bot-main.js'),'utf8');
 assert.ok(src.includes("if(mode==='emojis')"));
 assert.ok(!src.includes("'setup','verify'"));
});


test('V4.17.5: dashboard really closes a waiting voice request and records a durable audit',async()=>{
 const {mod,guild,state,members,channels}=mk();
 const waitId='111111111111111111',noticeId='222222222222222222',caseId='waiting-case';
 let edits=0;
 channels.set(noticeId,{id:noticeId,type:ChannelType.GuildText,messages:{fetch:async()=>({edit:async()=>{edits++}})}});
 state.supportSettings[ID]={voice:{waitingId:waitId,notificationId:noticeId,teamRoleId:ROLE,logsId:null}};
 state.supportVoiceCases[caseId]={id:caseId,guildId:ID,userId:USER,status:'waiting',createdAt:Date.now(),messageId:'888888888888888888',roomId:null,staffId:null};
 members.set(ADMIN,{id:ADMIN,permissions:{has:()=>true},roles:{cache:new Map()}});
 const response=await mod.dashboardAction(ID,ADMIN,'voice',caseId,'close');
 assert.equal(response.ok,true);
 assert.equal(response.case.status,'closed');
 assert.equal(state.supportVoiceCases[caseId].status,'closed');
 assert.equal(state.supportVoiceCases[caseId].closedBy,ADMIN);
 assert.ok(state.supportVoiceCases[caseId].endedAt);
 assert.equal(edits,1);
 assert.ok(state.audit.some(e=>e.action==='support_voice_close_waiting'&&e.actorId===ADMIN));
 await assert.rejects(mod.dashboardAction(ID,ADMIN,'voice',caseId,'close'),/bereits geschlossen/);
 await assert.rejects(mod.dashboardAction(ID,USER,'voice',caseId,'close'),/Administratoren/);
});

test('V4.17.5: failed persistence never reports a waiting voice case as closed',async()=>{
 const {mod,guild,state,store,members}=mk();
 const caseId='persist-fail';
 state.supportSettings[ID]={voice:{teamRoleId:ROLE}};
 state.supportVoiceCases[caseId]={id:caseId,guildId:ID,userId:USER,status:'waiting',createdAt:Date.now()};
 members.set(ADMIN,{id:ADMIN,permissions:{has:()=>true},roles:{cache:new Map()}});
 store.persist=async()=>{throw Error('storage unavailable')};
 await assert.rejects(mod.dashboardAction(ID,ADMIN,'voice',caseId,'close'),/storage unavailable/);
 assert.equal(state.supportVoiceCases[caseId].status,'waiting');
 assert.equal(state.supportVoiceCases[caseId].closedBy,undefined);
 assert.equal((state.audit||[]).length,0);
});

test('4.18.3: first substantive staff reply claims the ticket and announces role once',async()=>{
 const {mod,guild,state,members,channels}=mk();
 const channelId='888888888888888888',ticketId='ticket-1',sent=[];
 channels.set(channelId,{id:channelId,send:async payload=>{sent.push(payload);return {id:'999999999999999999'}}});
 state.supportSettings[ID]={tickets:{teamRoleId:ROLE}};
 state.supportTickets[ticketId]={id:ticketId,guildId:ID,channelId,userId:USER,kind:'question',status:'open',createdAt:Date.now()};
 members.set(ADMIN,{id:ADMIN,displayName:'Max',permissions:{has:()=>true},roles:{cache:new Map()}});
 const msg={guild,guildId:ID,channelId,author:{id:ADMIN,bot:false},content:'Ich kümmere mich um dein Anliegen.'};
 assert.equal(await mod.onTicketMessage(msg),true);
 assert.equal(state.supportTickets[ticketId].status,'claimed');
 assert.equal(state.supportTickets[ticketId].staffId,ADMIN);
 assert.equal(sent.length,1);
 assert.match(sent[0].content,/Owner Max hat das Ticket übernommen/);
 assert.deepEqual(sent[0].allowedMentions,{parse:[]});
 assert.equal(await mod.onTicketMessage(msg),false);
 assert.equal(sent.length,1);
 assert.equal(state.audit.filter(x=>x.action==='support_ticket_claim').length,1);
});
test('4.18.3: concurrent replies cannot claim twice or announce twice',async()=>{
 const {mod,guild,state,members,channels,store}=mk();
 const channelId='888888888888888888',sent=[];
 channels.set(channelId,{id:channelId,send:async payload=>{sent.push(payload);return {id:'999999999999999999'}}});
 state.supportSettings[ID]={tickets:{teamRoleId:ROLE}};
 state.supportTickets.a={id:'a',guildId:ID,channelId,userId:USER,kind:'question',status:'open'};
 members.set(ADMIN,{id:ADMIN,displayName:'Max',permissions:{has:()=>true},roles:{cache:new Map()}});
 const msg={guild,channelId,author:{id:ADMIN,bot:false},content:'Ich übernehme die Bearbeitung dieses Tickets.'};
 const results=await Promise.all([mod.onTicketMessage(msg),mod.onTicketMessage(msg)]);
 assert.deepEqual(results.sort(),[false,true]);
 assert.equal(sent.length,1);
 assert.equal(state.supportTickets.a.staffId,ADMIN);
});
test('4.18.3: requester, non-staff, bots, short replies and commands never auto-claim',async()=>{
 const {mod,guild,state,members,channels}=mk();
 const channelId='888888888888888888',other='777777777777777777';
 channels.set(channelId,{id:channelId,send:async()=>{throw Error('unexpected announcement')}});
 state.supportSettings[ID]={tickets:{teamRoleId:ROLE}};
 state.supportTickets.a={id:'a',guildId:ID,channelId,userId:USER,kind:'report',status:'open'};
 members.set(USER,{id:USER,permissions:{has:()=>false},roles:{cache:new Map()}});
 members.set(other,{id:other,permissions:{has:()=>false},roles:{cache:new Map()}});
 members.set(ADMIN,{id:ADMIN,permissions:{has:()=>true},roles:{cache:new Map()}});
 for(const [author,content] of [[USER,'Ich habe noch eine Frage'],[other,'Ich kümmere mich darum'],[ADMIN,'ok'],[ADMIN,'/ticket status']]){
   assert.equal(await mod.onTicketMessage({guild,channelId,author:{id:author,bot:false},content}),false);
 }
 assert.equal(await mod.onTicketMessage({guild,channelId,author:{id:ADMIN,bot:true},content:'Ich helfe dir gleich weiter'}),false);
 assert.equal(state.supportTickets.a.status,'open');
});
test('4.18.3: failed claim persistence rolls back and emits no announcement',async()=>{
 const {mod,guild,state,members,channels,store}=mk();
 const channelId='888888888888888888',sent=[];
 channels.set(channelId,{id:channelId,send:async p=>sent.push(p)});
 state.supportSettings[ID]={tickets:{teamRoleId:ROLE}};
 state.supportTickets.a={id:'a',guildId:ID,channelId,userId:USER,kind:'question',status:'open',staffId:null,claimedAt:null};
 members.set(ADMIN,{id:ADMIN,permissions:{has:()=>true},roles:{cache:new Map()}});
 store.persist=async()=>{throw Error('storage unavailable')};
 await assert.rejects(mod.onTicketMessage({guild,channelId,author:{id:ADMIN,bot:false},content:'Ich kümmere mich um dieses Problem.'}),/storage unavailable/);
 assert.equal(state.supportTickets.a.status,'open');
 assert.equal(state.supportTickets.a.staffId,null);
 assert.equal(state.supportTickets.a.claimedAt,null);
 assert.equal(sent.length,0);
});
test('4.18.3: Discord MessageCreate routes into auto-claim handler',()=>{
 const src=require('node:fs').readFileSync(require('node:path').join(__dirname,'../src/bot-main.js'),'utf8');
 assert.match(src,/supportSuite\.onTicketMessage\(message\)/);
});
