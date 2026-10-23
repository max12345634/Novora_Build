'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');
const original=Module._load;
class Embed{setColor(){return this}setTitle(){return this}setDescription(){return this}addFields(){return this}setFooter(){return this}setTimestamp(){return this}}
Module._load=function(id,parent,isMain){if(id==='discord.js')return{PermissionsBitField:{Flags:{Administrator:'admin'}},EmbedBuilder:Embed};return original.call(this,id,parent,isMain)};
const {makeOwnerAlerts,classifyAlert}=require('../src/owner-alerts');Module._load=original;
const G='123456789012345678',A='234567890123456789',OTHER='345678901234567890';
function fixture(){let dms=[];let records=0;let admin=true;
  const state={guilds:{[G]:{}}};const store={state,persist:async()=>{records++}};
  const guild={id:G,name:'Novora RP',ownerId:'987654321098765432',members:{fetch:async({user})=>user===A?{permissions:{has:()=>admin}}:null}};
  const client={guilds:{cache:new Map([[G,guild]])},users:{fetch:async id=>({send:async opts=>dms.push({id,opts})})}};
  const alerts=makeOwnerAlerts({client,store});return{alerts,store,guild,setAdmin:x=>admin=x,get dms(){return dms},get records(){return records}};
}
test('admin can subscribe self; other IDs cannot be mutated through their preferences',async()=>{const f=fixture();const r=await f.alerts.update(G,A,{action:'enable'});assert.equal(r.ok,true);assert.equal(r.profile.userId,A);assert.equal(f.store.state.guilds[G].ownerNotifications[OTHER],undefined);assert.equal(f.records,1)});
test('nonadmin blocked from subscribing or reading',async()=>{const f=fixture();f.setAdmin(false);await assert.rejects(()=>f.alerts.update(G,A,{action:'enable'}),/Administrator/);await assert.rejects(()=>f.alerts.get(G,A),/Administrator/)});
test('mute each category and unmute; explicit notices',async()=>{const f=fixture();await f.alerts.update(G,A,{action:'enable'});const a=await f.alerts.update(G,A,{action:'mute',category:'roles'});assert.match(a.notice,/deaktiviert/);assert.deepEqual(a.profile.muted,['roles']);await f.alerts.update(G,A,{action:'unmute',category:'roles'});assert.deepEqual((await f.alerts.get(G,A)).profile.muted,[])});
test('mute prevents matching role notifications, critical still delivered',async()=>{const f=fixture();await f.alerts.update(G,A,{action:'enable'});await f.alerts.update(G,A,{action:'mute',category:'roles'});await f.alerts.notify({id:'1',guildId:G,action:'member_roles',level:'info',summary:'Role'},f.guild);assert.equal(f.dms.length,0);await f.alerts.notify({id:'2',guildId:G,action:'member_roles',level:'critical',summary:'Admin'},f.guild);assert.equal(f.dms.length,1)});
test('disable means no further DMs at all',async()=>{const f=fixture();await f.alerts.update(G,A,{action:'enable'});const v=await f.alerts.update(G,A,{action:'disable'});assert.match(v.notice,/keine neuen/);await f.alerts.notify({id:'3',guildId:G,action:'member_roles',level:'critical',summary:'Admin'},f.guild);assert.equal(f.dms.length,0)});
test('private notifications stop when Discord admin permission revoked',async()=>{const f=fixture();await f.alerts.update(G,A,{action:'enable'});f.setAdmin(false);await f.alerts.notify({id:'4',guildId:G,action:'member_roles',level:'critical',summary:'Admin'},f.guild);assert.equal(f.dms.length,0)});
test('categorization covers system, moderation, roles and critical',()=>{assert.equal(classifyAlert({level:'critical',action:'moderation'}),'critical');assert.equal(classifyAlert({action:'member_roles'}),'roles');assert.equal(classifyAlert({action:'moderation'}),'moderation');assert.equal(classifyAlert({action:'webhook'}),'system')});
