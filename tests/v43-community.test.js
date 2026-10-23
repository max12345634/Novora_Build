'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const original=Module._load;
Module._load=function(mod,...args){if(mod==='discord.js')return require('./discord-stub');return original.call(this,mod,...args);};
const {TYPES,newModal,validateAnswers,makeCommunitySuite,header,ticketCard}=require('../src/community-suite');
const {QUESTIONS,fieldsFor,normalizeSubmission}=require('../src/support-questions');
const {makeMemberGreetings}=require('../src/member-greetings');
const {makeVoiceAudio}=require('../src/voice-audio');
const {fields,choices}=require('../src/setup-flow');
const {decorate}=require('../src/panel-art');
Module._load=original;
const gid='123456789012345678',owner='123456789012345679',userId='123456789012345680',team='123456789012345681';
const guild={id:gid,name:'⚡Berlin RP✨',ownerId:owner};
test('V4.3 five support categories have distinct question sets, valid forms and issue-specific handling',()=>{
 assert.deepEqual(Object.keys(QUESTIONS),['question','rules','player','technical','report']);
 for(const [kind,cfg] of Object.entries(QUESTIONS)){
  assert.ok(cfg.fields.length===2,kind);
  assert.ok(cfg.guidance.length>=25);
  const submitted=Object.fromEntries(cfg.fields.map(([id,,style])=>[id,'Information zu '+id]));
  const answers=normalizeSubmission(kind,submitted);
  assert.equal(Object.keys(answers).length,cfg.fields.length);
  assert.equal(fieldsFor(kind),cfg.fields);
 }
 assert.notEqual(fieldsFor('question')[0][1],fieldsFor('report')[0][1]);
 assert.notEqual(fieldsFor('player')[1][1],fieldsFor('technical')[1][1]);
 assert.throws(()=>normalizeSubmission('report',{title:'A'}),/Bitte beantworte/);
});
test('V4.4 only server-team applications are available; old application types disabled',()=>{
 assert.deepEqual(Object.keys(TYPES),['staff']);
 for(const [kind,record] of Object.entries(TYPES)){
  const modal=newModal(gid,'application',kind);
  assert.equal(modal.components.length,5,kind);
  assert.ok(modal.components.every(r=>r.components.length===1));
  assert.equal(modal.data.custom_id,`nvc:form:application:${kind}:${gid}`);
  const answers={profile:'Testspieler',...Object.fromEntries(record.fields.map(f=>[f[0],'RP Fall']))};
  assert.ok(validateAnswers('application',kind,answers).profile);
 }
 assert.throws(()=>newModal(gid,'application','police'),/Unbekannte Auswahl/);
 const factions=newModal(gid,'faction','legal');assert.equal(factions.components.length,5);
 assert.match(factions.data.custom_id,/faction:legal/);
 assert.notEqual(newModal(gid,'faction','legal').data.title,newModal(gid,'faction','illegal').data.title);
});
test('V4.3 application and faction configurations appear in /setup with required role/channel steps',()=>{
 for(const kind of ['application','faction','welcome']){
  assert.ok(choices.some(x=>x.value===kind));assert.ok(fields[kind]?.length>=2);
 }
 assert.ok(fields.faction.some(x=>x.key==='legalforum'));
 assert.ok(fields.faction.some(x=>x.key==='illegalforum'));
 assert.ok(fields.tickets.some(x=>x.key==='beschwerdeteam'));
 assert.ok(fields.panel[0].options.some(x=>x.value==='faction'));
});
test('V4.3 faction invite validation blocks bad URLs and stores legal/illegal separately',()=>{
 const answer={name:'Metro Dispatch',invite:'https://discord.gg/AbCdE',description:'Rolle',members:'5 Mitglieder',rules:'RP-Regeln'};
 assert.equal(validateAnswers('faction','legal',answer).invite,answer.invite);
 assert.throws(()=>validateAnswers('faction','illegal',{...answer,invite:'https://bad.host/anything'}),/Discord-Einladungslink/);
 assert.throws(()=>newModal(gid,'faction','global'),/Unbekannte Auswahl/);
});
test('V4.3 cannot decide another guild\'s case, and own application is never staff authorized',async()=>{
 const state={communitySettings:{[gid]:{application:{teamRoleId:team,panelId:'11',categoryId:'22'}}},communityCases:{'one':{id:'one',guildId:gid,system:'application',type:'rp',status:'open',userId,userId2:userId}}};
 const client={user:{id:'123456789012345699'}};
 const store={state,persist:async()=>{}};
 const suite=makeCommunitySuite({client,store});
 let replied;
 const actor={customId:'nvc:claim:one',guildId:gid,user:{id:userId},guild:{...guild,members:{fetch:async()=>({id:userId,permissions:{has:()=>false},roles:{cache:new Map([[team,true]])}})}},
  inGuild:()=>true,isButton:()=>true,reply:async p=>{replied=p;},deferReply:async()=>{actor.deferred=true;},editReply:async p=>{replied=p;}};
 assert.equal(await suite.onInteraction(actor),true);
 assert.match(replied.content,/Eigene Anträge/);
 assert.equal(state.communityCases.one.status,'open');
 replied=null;
 await suite.onInteraction({...actor,guildId:'100000000000000000'});
 assert.match(replied.content,/nicht gefunden/);
});
test('V4.3 new panel attachment names exist and Discord V2 metadata is correct',()=>{
 const store={state:{appEmojis:{}}};
 for(const kind of ['application','faction']){
  const packet=header(guild,kind,store);
  const decorated=decorate(packet,kind==='application'?'applications':'factions',null);
  assert.equal(decorated.flags,32768);
  assert.equal(decorated.files.length,1);
  assert.equal(decorated.files[0].file.readUInt32BE(16),1200);
  assert.equal(decorated.files[0].file.readUInt32BE(20),280);
 }
 const receipt=ticketCard(guild,{system:'faction',type:'legal',id:'123e4567-e89b-42d3-a456-426614174000',userId,staffId:null,status:'open',answers:{name:'Test',description:'Legal',invite:'https://discord.gg/abcd'}},store);
 assert.equal(receipt.components[0].components.some(c=>String(c?.items?.[0]?.media?.url||'').includes('novora-faction-open.png')),true);
});
test('V4.3 welcome/leave channels are separate and blocked when disabled',async()=>{
 const state={};const store={state,persist:async()=>{}};const greetings=makeMemberGreetings({store});
 const sent=[];
 const channels={w:{send:async msg=>{sent.push(['w',msg]);}},l:{send:async msg=>{sent.push(['l',msg]);}}};
 const member={id:userId,user:{username:'Test'},guild:{id:gid,name:'Berlin RP',channels:{fetch:async id=>channels[id]}}};
 assert.equal(await greetings.event(member,'join'),false);
 await greetings.configure(gid,{welcomeId:'w',leaveId:'l'});
 assert.equal(await greetings.event(member,'join'),true);
 assert.equal(await greetings.event(member,'leave'),true);
 assert.deepEqual(sent.map(x=>x[0]),['w','l']);
 assert.equal(sent[0][1].allowedMentions.parse.length,0);
 assert.equal(sent[1][1].allowedMentions.users.length,0);
});
test('V4.3 waiting audio ships OGG files, refuses to join without permissions',async()=>{
 for(const name of ['waiting-music.ogg','welcome-generic.ogg']){
  const bytes=fs.readFileSync(path.join(__dirname,'..','assets','audio',name));
  assert.ok(bytes.length>1000);
  assert.equal(bytes.subarray(0,4).toString('ascii'),'OggS');
 }
 const voice=makeVoiceAudio({client:{},dataDir:'/tmp/novora-v43-tests'});
 const vGuild={id:gid,name:'Test',members:{fetchMe:async()=>({permissionsIn:()=>({has:()=>false})})}};
 assert.equal(await voice.enter(vGuild,{id:'channel'}),false);
 assert.equal(voice.sessions.size,0);
 voice.shutdown();
});
