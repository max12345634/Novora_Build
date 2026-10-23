'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const Module=require('node:module'),originalLoad=Module._load;
Module._load=function(name,...args){if(name==='discord.js')return require('./discord-stub');return originalLoad.call(this,name,...args);};
const {makeMemberGreetings}=require('../src/member-greetings');
const {makeVoiceAudio}=require('../src/voice-audio');
Module._load=originalLoad;
const gid='123456789012345678';
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function voiceHarness({retryDelayMs=0,createIntro=async()=>'/intro.ogg',fetchMe}={}){
 let joins=0,destroys=0,failJoin=false;
 const voice={
  NoSubscriberBehavior:{Play:'play'},AudioPlayerStatus:{Idle:'idle'},
  joinVoiceChannel:()=>{joins++;if(failJoin)throw Error('temporary gateway failure');return {subscribe:()=>{},destroy(){destroys++;this.destroyed=true;}};},
  createAudioPlayer:()=>{const p=new EventEmitter();p.play=()=>{};p.stop=()=>{};return p;},
  createAudioResource:file=>({file})
 };
 const members=[];
 const channel={id:'waiting',members:{some:predicate=>members.some(predicate)}};
 const guild={id:gid,name:'Novora Test',members:{fetchMe:fetchMe||(async()=>({permissionsIn:()=>({has:()=>true})}))},channels:{fetch:async()=>channel}};
 const audio=makeVoiceAudio({client:{},dataDir:'/tmp/novora-v49-test',voice,createIntro,retryDelayMs});
 return {audio,guild,channel,members,get joins(){return joins},get destroys(){return destroys},set failJoin(x){failJoin=x}};
}
test('V4.9: a failed greeting settings commit restores previous channel configuration',async()=>{
 const state={memberGreetingSettings:{[gid]:{welcomeId:'old',leaveId:'bye',updatedAt:1}}};
 const store={state,persist:async()=>{throw Error('disk full')}};
 const greeting=makeMemberGreetings({store});
 await assert.rejects(greeting.configure(gid,{welcomeId:'new',leaveId:'other'}),/disk full/);
 assert.equal(greeting.setting(gid).welcomeId,'old');
 assert.equal(greeting.setting(gid).leaveId,'bye');
});
test('V4.9: a failed first greeting settings commit leaves no active configuration',async()=>{
 const state={};const greeting=makeMemberGreetings({store:{state,persist:async()=>{throw Error('read-only disk')}}});
 await assert.rejects(greeting.configure(gid,{welcomeId:'new'}),/read-only disk/);
 assert.equal(greeting.setting(gid),null);
});
test('V4.9: unknown greeting events do not send leave messages',async()=>{
 const state={memberGreetingSettings:{[gid]:{welcomeId:'w',leaveId:'l'}}};let sent=0;
 const greeting=makeMemberGreetings({store:{state,persist:async()=>{}}});
 assert.equal(await greeting.event({id:'member',user:{bot:false},guild:{id:gid,channels:{fetch:async()=>({send:async()=>sent++})}}},'unknown'),false);
 assert.equal(sent,0);
});
test('V4.9: simultaneous voice joins use exactly one connection',async()=>{
 const wait=deferred();const h=voiceHarness({fetchMe:async()=>{await wait.promise;return {permissionsIn:()=>({has:()=>true})};}});
 const a=h.audio.enter(h.guild,h.channel),b=h.audio.enter(h.guild,h.channel);
 wait.resolve();assert.deepEqual(await Promise.all([a,b]),[true,true]);
 assert.equal(h.joins,1);assert.equal(h.audio.sessions.size,1);h.audio.shutdown();
});
test('V4.9: a transient voice connection failure allows a later retry',async()=>{
 const h=voiceHarness();h.failJoin=true;
 assert.equal(await h.audio.enter(h.guild,h.channel),false);
 h.failJoin=false;
 assert.equal(await h.audio.enter(h.guild,h.channel),true);
 assert.equal(h.joins,2);h.audio.shutdown();
});
test('V4.9: missing channel member information never proves the room is empty',async()=>{
 const h=voiceHarness();await h.audio.enter(h.guild,h.channel);
 h.channel.members=undefined;
 await h.audio.checkLeave(h.guild,'waiting');
 assert.equal(h.audio.sessions.size,1);h.audio.shutdown();
});
test('V4.9: last human leaving closes the voice connection',async()=>{
 const h=voiceHarness();await h.audio.enter(h.guild,h.channel);
 h.members.push({user:{bot:true}});
 await h.audio.checkLeave(h.guild,'waiting');
 assert.equal(h.audio.sessions.size,0);assert.equal(h.destroys,1);
});
test('V4.9: a user leaving during pending permission check cancels the join',async()=>{
 const wait=deferred();const h=voiceHarness({fetchMe:async()=>{await wait.promise;return {permissionsIn:()=>({has:()=>true})};}});
 const started=h.audio.enter(h.guild,h.channel);
 await h.audio.checkLeave(h.guild,'waiting');wait.resolve();
 assert.equal(await started,false);assert.equal(h.joins,0);h.audio.shutdown();
});
test('V4.9: shutdown cancels an unfinished join',async()=>{
 const wait=deferred();const h=voiceHarness({fetchMe:async()=>{await wait.promise;return {permissionsIn:()=>({has:()=>true})};}});
 const started=h.audio.enter(h.guild,h.channel);h.audio.shutdown();wait.resolve();
 assert.equal(await started,false);assert.equal(h.joins,0);
});
test('V4.9: connection is cleaned up if player creation throws',async()=>{
 const h=voiceHarness();let destroyed=0;const badVoice={NoSubscriberBehavior:{Play:'play'},joinVoiceChannel:()=>({subscribe:()=>{},destroy(){destroyed++;this.destroyed=true;}}),createAudioPlayer:()=>{throw Error('player unavailable')}};
 const v=makeVoiceAudio({client:{},dataDir:'/tmp/novora-v49-test',voice:badVoice,retryDelayMs:0});
 assert.equal(await v.enter(h.guild,h.channel),false);assert.equal(v.sessions.size,0);assert.equal(destroyed,1);v.shutdown();
});

test('V4.9: an old player error cannot destroy a newer session',async()=>{
 const h=voiceHarness();await h.audio.enter(h.guild,h.channel);
 const stale=h.audio.sessions.get(gid).player;
 h.audio.sessions.delete(gid);
 await h.audio.enter(h.guild,h.channel);
 stale.emit('error',Error('old connection failed'));
 assert.equal(h.audio.sessions.size,1);h.audio.shutdown();
});
test('V4.9: music playback errors are handled without an unhandled event exception',async()=>{
 const h=voiceHarness();await h.audio.enter(h.guild,h.channel);
 const player=h.audio.sessions.get(gid).player;
 player.play=()=>{throw Error('audio decoder failed');};
 assert.doesNotThrow(()=>player.emit('idle'));
 assert.equal(h.audio.sessions.size,0);h.audio.shutdown();
});
