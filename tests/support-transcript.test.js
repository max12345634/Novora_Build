'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const Module=require('node:module');const original=Module._load;const discord=require('./discord-stub');Module._load=function(request,...rest){if(request==='discord.js')return discord;return original.call(this,request,...rest)};
const {makeSupportSuite}=require('../src/support-suite');Module._load=original;
const gid='111111111111111111',uid='222222222222222222',staffId='333333333333333333';
test('support closure writes locally protected bounded transcript, does not publish message contents',async()=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'nv36-transcript-'));
 try{
 const state={},store={state,dataDir,persist:async()=>{}};
 const channelId='444444444444444444',cid='d750b26f-4d5f-41bf-a730-0123456789ab';let sent=[];
 let deleted=false;const ch={id:channelId,name:'ticket-report',delete:async()=>{deleted=true},messages:{fetch:async x=>typeof x==='object'?new Map([
 ['1',{author:{id:uid,bot:false},createdTimestamp:Date.now()-5000,content:'Mein Supportproblem',attachments:new Map()}],
 ['2',{author:{id:staffId,bot:false},createdTimestamp:Date.now()-2000,content:'Wir prüfen das.',attachments:new Map()}]
 ]):null},permissionOverwrites:{edit:async()=>{}},setName:async()=>{},send:async v=>sent.push(v)};
 const user={id:uid,send:async()=>{}},actor={id:staffId,permissions:{has:()=>false},roles:{cache:new Map([['555555555555555555',true]])}};
 const members=new Map([[staffId,actor]]);
 const guild={id:gid,ownerId:'666666666666666666',name:'Novora',channels:{fetch:async id=>id===channelId?ch:null},members:{fetch:async id=>members.get(id)||null}};
 const client={user:{id:'777777777777777777'},users:{fetch:async()=>user},guilds:{cache:new Map([[gid,guild]])}};
 const mod=makeSupportSuite({client,store});state.supportSettings[gid]={tickets:{teamRoleId:'555555555555555555',panelMessageId:null,logId:null,ratingsId:null}};
 state.supportTickets[cid]={id:cid,guildId:gid,userId:uid,kind:'report',status:'claimed',title:'Support',description:'Hilfe',createdAt:Date.now()-5000,channelId,messageId:'',staffId};
 const result=await mod.actionTicket(guild,staffId,cid,'close');assert.equal(result.status,'closed');
 const file=state.supportTranscriptIndex[state.supportTickets[cid].transcriptToken].file;assert.ok(fs.existsSync(file));
 const record=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(record.items.length,2);assert.ok(record.items.some(m=>m.text==='Mein Supportproblem'));
 assert.ok((fs.statSync(file).mode&0o077)===0,'transcript must be owner-readable only');
 assert.equal(state.supportTickets[cid].hasTranscript,true);assert.equal(deleted,true,'closed ticket channel should be deleted');
 assert.ok(!sent.some(x=>JSON.stringify(x).includes('Mein Supportproblem')),'transcript must not be sent publicly');
 await assert.rejects(mod.actionTicket(guild,staffId,cid,'close'),/geschlossen/);
 }finally{fs.rmSync(dataDir,{recursive:true,force:true})}
});
