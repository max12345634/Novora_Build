'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const Module=require('node:module');const original=Module._load;
class FakePerms{constructor(bits){this.bits=new Set(bits)}has(flag){return this.bits.has(flag)}}
Module._load=function(id,parent,isMain){if(id==='discord.js')return{PermissionsBitField:{Flags:{Administrator:'admin',ManageRoles:'manage'}},ButtonBuilder:class{},ActionRowBuilder:class{},EmbedBuilder:class{},ButtonStyle:{}};return original.call(this,id,parent,isMain)};
const {makeRoleAdministration}=require('../src/roles');Module._load=original;
const A='111111111111111111',U='222222222222222222',G='333333333333333333',R='444444444444444444',HIGH='555555555555555555';
function fixture({admin=true,roleAdmin=false,botHigh=50,actorHigh=40,roleHigh=10}={}){
 let changed=0,sent=0,lastReason='';const permissions=new FakePerms(admin?['admin']:[]);
 const actor={id:A,permissions,roles:{highest:{position:actorHigh}}};
 const target={id:U,roles:{highest:{position:5},cache:new Map(),add:async(_id,reason)=>{changed++;lastReason=reason;target.roles.cache.set(R,role)},remove:async()=>{changed++;target.roles.cache.delete(R)}}};
 const bot={permissions:new FakePerms(['manage']),roles:{highest:{position:botHigh}}};
 const role={id:R,name:'Bürger',position:roleHigh,managed:false,permissions:new FakePerms(roleAdmin?['admin']:[])};
 const allRoles=new Map([[R,role],[HIGH,{id:HIGH,name:'Team',position:75,managed:false,permissions:new FakePerms([])}]]);
 const guild={id:G,name:'Berlin RP',ownerId:'999999999999999999',members:{fetch:async({user})=>user===A?actor:user===U?target:null,fetchMe:async()=>bot},roles:{fetch:async id=>id?allRoles.get(id):allRoles}};
 const client={guilds:{cache:new Map([[G,guild]])},users:{fetch:async()=>({send:async()=>{sent++}})}};
 const roles=makeRoleAdministration({client,store:{state:{}}});return{roles,target,client,get changed(){return changed},get sent(){return sent},get reason(){return lastReason}};
}
test('admin receives a guild-scoped claim code and single-use grant',async()=>{const f=fixture();const code=await f.roles.issueGuildCode(G,A);assert.match(code,/^\d{8}$/);assert.equal((await f.roles.claimGuildCode(G,code)).status,200);assert.equal((await f.roles.claimGuildCode(G,code)).status,403)});
test('non administrator cannot claim role access',async()=>{await assert.rejects(()=>fixture({admin:false}).roles.issueGuildCode(G,A),/Administratorrechte/)});
test('grant code is server scoped',async()=>{const f=fixture(),code=await f.roles.issueGuildCode(G,A);assert.equal((await f.roles.claimGuildCode('666666666666666666',code)).status,403);assert.equal((await f.roles.claimGuildCode(G,code)).status,200)});
test('dashboard role action applies immediately with audit reason and no Discord DM',async()=>{const f=fixture();const r=await f.roles.requestChange({guildId:G,userId:U,adminId:A,roleId:R,action:'add'});assert.equal(r.status,200);assert.equal(r.body.status,'completed');assert.equal(f.changed,1);assert.equal(f.sent,0);assert.match(f.reason,/Novora Dashboard: Direktaktion von/);assert.equal(f.roles.status({requestId:r.body.requestId,adminId:A,guildId:G}).body.status,'completed')});
test('same state changes are rejected, including missing removal',async()=>{const f=fixture();assert.equal((await f.roles.requestChange({guildId:G,userId:U,adminId:A,roleId:R,action:'remove'})).status,409);await f.roles.requestChange({guildId:G,userId:U,adminId:A,roleId:R,action:'add'});assert.equal((await f.roles.requestChange({guildId:G,userId:U,adminId:A,roleId:R,action:'add'})).status,409)});
test('higher role and roles with Administrator remain blocked',async()=>{const f=fixture();assert.equal((await f.roles.requestChange({guildId:G,userId:U,adminId:A,roleId:HIGH,action:'add'})).status,403);const a=fixture({roleAdmin:true});assert.equal((await a.roles.requestChange({guildId:G,userId:U,adminId:A,roleId:R,action:'add'})).status,403)});
test('nonadmin cannot modify other member roles',async()=>{const f=fixture({admin:false});assert.equal((await f.roles.requestChange({guildId:G,userId:U,adminId:A,roleId:R,action:'add'})).status,403);assert.equal(f.changed,0)});
test('role-status response is admin and guild scoped',async()=>{const f=fixture();const r=await f.roles.requestChange({guildId:G,userId:U,adminId:A,roleId:R,action:'add'});assert.equal(f.roles.status({requestId:r.body.requestId,guildId:G,adminId:'777777777777777777'}).status,404)});
