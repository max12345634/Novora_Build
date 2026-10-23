'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const native=Module._load;
Module._load=function(mod,...args){if(mod==='discord.js')return require('./discord-stub');return native.call(this,mod,...args);};
const {makeCommunitySuite,TYPES,newModal,validateAnswers,header}=require('../src/community-suite');
const {QUESTIONS,fieldsFor,normalizeSubmission}=require('../src/support-questions');
const {makeMemberGreetings}=require('../src/member-greetings');
const {makeVoiceAudio}=require('../src/voice-audio');
const {fields}=require('../src/setup-flow');
const {ticketView}=require('../src/support-suite');
Module._load=native;
const gid='123456789012345678',user='234567890123456789',staffId='345678901234567890',caseId='aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee';
const cfg={panelId:'panel',panelMessageId:'card',categoryId:'category',teamRoleId:'team',legalForumId:'legal',illegalForumId:'illegal'};
function make({system='faction',status='claimed',staff=staffId,guildId=gid,category='legal'}={}){
 const record={id:caseId,system,guildId,userId:user,status,type:category,answers:{name:'Einsatztruppe',invite:'https://discord.gg/Nvc123',description:'Legale Gruppe mit Struktur',members:'5 Personen',rules:'Regelkonform'},staffId:staff,channelId:'private',messageId:'start',createdAt:Date.now()};
 const data={communitySettings:{[gid]:{[system]:{...cfg}}},communityCases:{[caseId]:record}};
 const store={state:data,dataDir:'/tmp/novora-internal-tests',persist:async()=>{}};
 const guild={id:gid,name:'🪐 Shadow RP',ownerId:'owner',members:{fetch:async id=>({id,permissions:{has:()=>false},roles:{cache:new Map([[id===staffId?'team':'none',true]])},send:async()=>{}})},channels:{fetch:async id=>({id,type:id==='legal'||id==='illegal'?15:0,
  threads:{create:async()=>({id:'thread-'+id})},messages:{fetch:async()=>({id:'start',embeds:[],edit:async payload=>({id:'start'})})},send:async()=>({id:'new'}),delete:async()=>{}})}};
 const suite=makeCommunitySuite({client:{user:{id:'bot'}},store,publicUrl:'https://example.invalid'});
 return {suite,guild,record,data};
}
function interaction(guild,id,userId=staffId){const messages=[];return {customId:id,guildId:gid,guild,user:{id:userId},inGuild:()=>true,isButton:()=>true,memberPermissions:{has:()=>false},deferUpdate:async()=>{},deferReply:async()=>{},reply:async p=>messages.push(p),editReply:async p=>messages.push(p),messages};}

test('five support categories have two concise targeted questions',()=>{
 assert.equal(Object.keys(QUESTIONS).length,5);
 const forms=Object.values(QUESTIONS).map(q=>q.fields.map(f=>f[1]).join('|'));
 assert.equal(new Set(forms).size,5);
 for(const key of Object.keys(QUESTIONS)){assert.ok(fieldsFor(key).length===2);assert.notEqual(QUESTIONS[key].guidance,'');}
 assert.throws(()=>normalizeSubmission('report',{title:'',description:'x'}),/Bitte beantworte/);
});
test('staff complaint has separate optional privacy category and team-role configuration',()=>{
 assert.ok(fields.tickets.some(x=>x.key==='beschwerden'&&x.optional));
 assert.ok(fields.tickets.some(x=>x.key==='beschwerdeteam'&&x.optional));
 assert.ok(fields.application.length>=3&&fields.faction.length>=5&&fields.welcome.length>=2);
});
test('only team application is selectable; faction still supports five fields',()=>{
 const forms=Object.keys(TYPES).map(type=>newModal(gid,'application',type));
 assert.equal(forms.length,1);
 assert.ok(forms.every(form=>form.components.length===5));
 assert.equal(newModal(gid,'faction','illegal').components.length,5);
 assert.throws(()=>newModal(gid,'application','police'),/Unbekannte Auswahl/);
});
test('faction form validates invitation and mandatory fields',()=>{
 const values={name:'Fraktion',invite:'https://discord.gg/ABcd2',description:'Konzept',members:'6',rules:''};
 assert.equal(validateAnswers('faction','legal',values).invite,values.invite);
 assert.throws(()=>validateAnswers('faction','illegal',{...values,invite:'http://example.com/invite'}),/Einladungslink/);
});
test('faction approval requires an independent category confirmation and never posts on first click',async()=>{
 const {suite,guild}=make();let response;
 const i=interaction(guild,'nvc:approve:'+caseId);i.reply=async p=>{response=p};
 assert.equal(await suite.onInteraction(i),true);
 assert.match(JSON.stringify(response.components),/Als legal bestätigen/);
 assert.match(JSON.stringify(response.components),/Als illegal bestätigen/);
 assert.equal(response.flags&64,64);
});
test('forum routing uses the staff-confirmed category, not the unverified application claim',async()=>{
 const {suite,guild,record}=make();let created=[];
 guild.channels.fetch=async id=>({id,type:id==='legal'||id==='illegal'?15:0,threads:{create:async()=>{created.push(id);return {id:'thread-'+id}}},messages:{fetch:async()=>({id:'start',embeds:[],edit:async()=>({id:'start'})})},delete:async()=>{}});
 const i=interaction(guild,'nvc:confirm:'+caseId+':illegal');
 await suite.onInteraction(i);assert.deepEqual(created,['illegal']);assert.equal(record.reviewedType,'illegal');assert.equal(record.status,'approved');assert.equal(record.forumChannelId,'illegal');
});
test('other-guild and ticket owner cannot approve a faction',async()=>{
 const {suite,guild,record}=make();const a=interaction(guild,'nvc:confirm:'+caseId+':legal',user);await suite.onInteraction(a);
 assert.equal(record.status,'claimed');assert.match(JSON.stringify(a.messages),/Nur das zuständige Team|Eigene Anträge/);
 const b=interaction({...guild,id:'different'},'nvc:confirm:'+caseId+':legal');b.guildId='different';await suite.onInteraction(b);
 assert.equal(record.status,'claimed');
});
test('rejected applications can only be archived after full transcript has been read and indexed',async()=>{
 const {suite,guild,record}=make({status:'rejected'});let removed=false;
 guild.channels.fetch=async id=>({id,messages:{fetch:async()=>{throw Error('Permission denied')}},delete:async()=>{removed=true}});
 const i=interaction(guild,'nvc:close:'+caseId);await suite.onInteraction(i);
 assert.equal(removed,false);assert.equal(record.status,'rejected');assert.match(JSON.stringify(i.messages),/Permission denied/);
});
test('new panel layout is V2 and contains the selected server name and menu',()=>{
 const {data,guild}=make();const panel=header(guild,'faction',{state:data});
 assert.equal(panel.flags,32768);assert.match(JSON.stringify(panel.components),/Shadow RP/);
 assert.match(JSON.stringify(panel.components),/nvc:choose:faction/);
 assert.doesNotMatch(JSON.stringify(panel.components),/🪐/);
});
test('join and leave notifications use only configured server channels',async()=>{
 const state={};let published=[];
 const store={state,persist:async()=>{}};const obj=makeMemberGreetings({store});
 await obj.configure(gid,{welcomeId:'welcome',leaveId:'bye'});
 const guild={id:gid,name:'🪐 Shadow RP',channels:{fetch:async id=>({send:async p=>published.push({id,p})})}};
 const member={id:user,guild,user:{username:'Tester',bot:false}};
 assert.equal(await obj.event(member,'join'),true);assert.equal(await obj.event(member,'leave'),true);
 assert.deepEqual(published.map(x=>x.id),['welcome','bye']);assert.match(JSON.stringify(published),/Shadow RP/);
});
test('voice audio ships with two locally-created valid Ogg recordings',()=>{
 for(const filename of ['waiting-music.ogg','welcome-generic.ogg']){
  const bytes=fs.readFileSync(path.join(__dirname,'../assets/audio',filename));
  assert.equal(bytes.subarray(0,4).toString(),'OggS');assert.ok(bytes.length>3000);
 }
 const audio=makeVoiceAudio({client:{},dataDir:'/tmp/voice-test'});assert.equal(audio.sessions.size,0);audio.shutdown();
});
test('all new graphics have reusable source icons and compact banners',()=>{
 for(const n of ['nv_application','nv_faction','nv_legal','nv_illegal','nv_welcome','nv_goodbye']){
  const png=fs.readFileSync(path.join(__dirname,'../assets/emojis',n+'.png'));
  assert.equal(png.readUInt32BE(16),128);assert.equal(png[25],6);
  assert.ok(png.length<256*1024);assert.ok(fs.existsSync(path.join(__dirname,'../assets/emojis',n+'.svg')));
 }
 for(const n of ['novora-panel-applications.png','novora-panel-factions.png','novora-application-open.png','novora-faction-open.png']){
  const bytes=fs.readFileSync(path.join(__dirname,'../assets/banners',n));assert.equal(bytes.readUInt32BE(16),1200);assert.equal(bytes.readUInt32BE(20),280);
 }
});
test('ticket presentation includes workflow step progress in the V2 message',()=>{
 const card=ticketView({id:caseId,userId:user,kind:'technical',status:'claimed',staffId,workflowStage:'Fehler bestätigt',createdAt:Date.now()}, {},'Berlin RP');
 assert.match(JSON.stringify(card.components),/Fehler bestätigt/);
});
