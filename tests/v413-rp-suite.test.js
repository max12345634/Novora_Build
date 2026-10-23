'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Module=require('node:module'),oldLoad=Module._load;
Module._load=function(name,...args){if(name==='discord.js')return {...require('./discord-stub'),PermissionFlagsBits:{...require('./discord-stub').PermissionFlagsBits,ManageGuild:32n}};return oldLoad.call(this,name,...args)};
const {makeRpSuite,commands}=require('../src/rp-suite');Module._load=oldLoad;
function fixture(){let fail=false;const store={state:{},persist:async()=>{if(fail)throw Error('disk failed')}};const suite=makeRpSuite({store});
 const run=async(name,{admin=true,action='an',topic='Hamburg Nacht-RP',user='100'}={})=>{
 let reply;const i={commandName:name,guildId:'123',user:{id:user},inGuild:()=>true,isChatInputCommand:()=>true,memberPermissions:{has:()=>admin},options:{getString:k=>k==='thema'?topic:action},reply:async x=>{reply=x;return x}};
 await suite.onInteraction(i);return reply;};return {store,suite,run,setFail:x=>fail=x};}
test('RP commands are unique',()=>{assert.equal(new Set(commands.map(c=>c.toJSON().name)).size,6)});
test('start, register, status, end',async()=>{const f=fixture();await f.run('rp-start');await f.run('rp-dienst');assert.match((await f.run('rp-status')).content,/1/);assert.match((await f.run('rp-ende')).content,/1/);assert.match((await f.run('rp-status')).content,/keine RP-Runde/)});
test('unauthorized start rejected',async()=>{const f=fixture();assert.match((await f.run('rp-start',{admin:false})).content,/Server verwalten/);assert.equal(f.store.state.rpSessions['123'],undefined)});
test('double start rejected',async()=>{const f=fixture();await f.run('rp-start');assert.match((await f.run('rp-start')).content,/bereits/)});
test('persist failure rolls back RP start',async()=>{const f=fixture();f.setFail(true);await assert.rejects(f.run('rp-start'),/disk failed/);assert.equal(f.store.state.rpSessions['123'],undefined)});
test('persist failure rolls back duty change',async()=>{const f=fixture();await f.run('rp-start');f.setFail(true);await assert.rejects(f.run('rp-dienst'),/disk failed/);assert.deepEqual(f.store.state.rpSessions['123'].members,{})});
test('RP state isolated by guild',async()=>{const f=fixture();await f.run('rp-start');assert.equal(f.store.state.rpSessions['other'],undefined)});
