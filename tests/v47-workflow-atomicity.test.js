'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module'),native=Module._load;
Module._load=function(request,...args){if(request==='discord.js')return require('./discord-stub');return native.call(this,request,...args)};
const {makeSupportSuite}=require('../src/support-suite');
const {makeCommunitySuite,TEAM_STEPS}=require('../src/community-suite');
Module._load=native;
const gid='111111111111111111',userId='222222222222222222',botId='333333333333333333',staffId='444444444444444444',panelId='555555555555555555',channelId='666666666666666666';
function ticketHarness({failCommit=false}={}){
 const state={supportSettings:{[gid]:{tickets:{panelId,categoryId:'category',teamRoleId:staffId,panelMessageId:'777777777777777777'}}}};
 let deleted=0,commits=0;
 const store={state,persist:async()=>{commits++;if(failCommit)throw Error('disk unavailable');}};
 const panel={id:panelId,messages:{fetch:async()=>({id:'777777777777777777',embeds:[],edit:async()=>{throw Error('Panel message deleted by moderator')}})}};
 const ticket={id:channelId,send:async()=>({id:'888888888888888888'}),delete:async()=>{deleted++;}};
 const guild={id:gid,name:'Berlin RP',members:{fetchMe:async()=>({permissions:{has:()=>true}})},channels:{create:async()=>ticket,fetch:async id=>id===panelId?panel:null}};
 const client={user:{id:botId}};
 const suite=makeSupportSuite({client,store});
 const i={customId:`nvs:tform:${gid}:technical`,guildId:gid,guild,user:{id:userId,username:'Test'},fields:{getTextInputValue:k=>k==='title'?'Bug im Spiel':'Beim Laden tritt ein Fehler auf'},isModalSubmit:()=>true,deferReply:async()=>{i.deferred=true},editReply:async p=>{i.response=p}};
 return {state,store,guild,suite,i,get deleted(){return deleted},get commits(){return commits}};
}
test('V4.7: broken public support panel never deletes an already persisted private ticket',async()=>{
 const h=ticketHarness();
 assert.equal(await h.suite.onInteraction(h.i),true);
 assert.equal(h.deleted,0);
 assert.equal(Object.keys(h.state.supportTickets).length,1);
 assert.match(JSON.stringify(h.i.response),/Ticket wurde erstellt/);
});
test('V4.7: failed support ticket commit rolls back the phantom record and deletes uncommitted channel',async()=>{
 const h=ticketHarness({failCommit:true});
 assert.equal(await h.suite.onInteraction(h.i),true);
 assert.equal(h.deleted,1);
 assert.equal(Object.keys(h.state.supportTickets).length,0);
 assert.match(JSON.stringify(h.i.response),/disk unavailable/);
});
test('V4.7: restored DM session after a committed application never creates a second ticket',async()=>{
 const saved={guildId:gid,userId,step:TEAM_STEPS.length,updatedAt:Date.now(),answers:{profile:'Bewerber'}};
 const state={communitySettings:{[gid]:{application:{teamRoleId:staffId}}},communityCases:{existing:{id:'existing',guildId:gid,userId,system:'application',status:'open',channelId}},applicationSessions:{[userId]:saved}};
 let created=0;const sent=[];
 const guild={id:gid,members:{fetch:async()=>({id:userId})},channels:{create:async()=>{created++;throw Error('duplicate')}}};
 const suite=makeCommunitySuite({client:{guilds:{fetch:async()=>guild}},store:{state,persist:async()=>{}}});
 const done=await suite.onDMMessage({guildId:null,author:{id:userId},content:'fertig',channel:{send:async p=>sent.push(p)}});
 assert.equal(done,true);assert.equal(created,0);assert.equal(state.applicationSessions[userId],undefined);
 assert.match(JSON.stringify(sent),/Team-Bewerbung eingereicht/);
 assert.match(JSON.stringify(sent),new RegExp(channelId));
});
test('V4.7: retry of faction approval after a failed status commit reuses forum thread',async()=>{
 const cid='11111111-aaaa-4bbb-cccc-ffffffffffff';
 const c={id:cid,guildId:gid,userId,system:'faction',type:'legal',status:'claimed',staffId,channelId,messageId:'777777777777777777',answers:{name:'Metro Police',description:'Legal RP',members:'5',invite:'https://discord.gg/ABCD'}};
 const state={communitySettings:{[gid]:{faction:{teamRoleId:staffId,legalForumId:'forum',illegalForumId:'illegal',logId:null}}},communityCases:{[cid]:c}};
 let commits=0,created=0;
 const store={state,persist:async()=>{commits++;if(commits===2)throw Error('disk temporarily full')}};
 const thread={id:'999999999999999999'};
 const forum={type:15,threads:{create:async()=>{created++;return thread},fetch:async id=>id===thread.id?thread:null}};
 const header={id:messageId(),embeds:[],edit:async()=>header};
 const channel={messages:{fetch:async()=>header}};
 const guild={id:gid,name:'Berlin RP',ownerId:'owner',members:{fetch:async id=>id===staffId?{id:staffId,roles:{cache:new Map([[staffId,true]])},permissions:{has:()=>false}}:{id:userId,send:async()=>{}}},channels:{fetch:async id=>id==='forum'?forum:id===channelId?channel:null}};
 const suite=makeCommunitySuite({client:{},store});
 function action(){const i={customId:`nvc:confirm:${cid}:legal`,guildId:gid,guild,user:{id:staffId},memberPermissions:{has:()=>false},inGuild:()=>true,isButton:()=>true,deferUpdate:async()=>{i.deferred=true},editReply:async p=>{i.result=p}};return i;}
 const first=action();assert.equal(await suite.onInteraction(first),true);
 assert.equal(c.status,'claimed');assert.equal(c.forumThreadId,thread.id);assert.equal(created,1);
 assert.match(JSON.stringify(first.result),/disk temporarily full/);
 const second=action();assert.equal(await suite.onInteraction(second),true);
 assert.equal(c.status,'approved');assert.equal(created,1);
 assert.match(JSON.stringify(second.result),/Fraktion freigegeben/);
});
function messageId(){return '777777777777777777'}
test('V4.7: failed community commit keeps DM answers, removes phantom case, and cleans uncommitted channel',async()=>{
 const answers=Object.fromEntries(TEAM_STEPS.map(([field])=>[field,'Antwort zu '+field]));
 const session={guildId:gid,userId,step:TEAM_STEPS.length,answers,updatedAt:Date.now()};
 const state={communitySettings:{[gid]:{application:{categoryId:'category',teamRoleId:staffId}}},communityCases:{},applicationSessions:{[userId]:session}};
 let removed=0,created=0;const sent=[];
 const ticket={id:channelId,send:async()=>({id:'777777777777777777'}),delete:async()=>{removed++;}};
 const guild={id:gid,name:'Berlin RP',members:{fetch:async()=>({id:userId})},channels:{create:async()=>{created++;return ticket}}};
 const store={state,persist:async()=>{throw Error('disk unavailable')}};
 const suite=makeCommunitySuite({client:{user:{id:botId},guilds:{fetch:async()=>guild}},store});
 assert.equal(await suite.onDMMessage({guildId:null,author:{id:userId},content:'fertig',channel:{send:async p=>sent.push(p)}}),true);
 assert.equal(created,1);assert.equal(removed,1);assert.equal(Object.keys(state.communityCases).length,0);
 assert.deepEqual(state.applicationSessions[userId].answers,answers);
 assert.match(JSON.stringify(sent),/disk unavailable/);
});
test('V4.7: missing review header after committed faction decision cannot trigger a second publication',async()=>{
 const cid='11111111-aaaa-4bbb-cccc-eeeeeeeeeeee';
 const c={id:cid,guildId:gid,userId,system:'faction',type:'legal',status:'claimed',staffId,channelId,messageId:'777777777777777777',answers:{name:'Metro Police',description:'Legal RP',members:'5',invite:'https://discord.gg/ABCD'}};
 const state={communitySettings:{[gid]:{faction:{teamRoleId:staffId,legalForumId:'forum',illegalForumId:'illegal'}}},communityCases:{[cid]:c}};
 let created=0;
 const forum={type:15,threads:{create:async()=>{created++;return{id:'999999999999999999'};}}};
 const guild={id:gid,name:'Berlin RP',ownerId:'owner',members:{fetch:async id=>id===staffId?{id:staffId,roles:{cache:new Map([[staffId,true]])},permissions:{has:()=>false}}:{id:userId,send:async()=>{}}},channels:{fetch:async id=>id==='forum'?forum:id===channelId?{messages:{fetch:async()=>null}}:null}};
 const suite=makeCommunitySuite({client:{},store:{state,persist:async()=>{}}});
 const i={customId:`nvc:confirm:${cid}:legal`,guildId:gid,guild,user:{id:staffId},memberPermissions:{has:()=>false},inGuild:()=>true,isButton:()=>true,deferUpdate:async()=>{i.deferred=true},editReply:async p=>{i.result=p}};
 assert.equal(await suite.onInteraction(i),true);assert.equal(c.status,'approved');assert.equal(created,1);
 assert.match(JSON.stringify(i.result),/Fraktion freigegeben/);
});
