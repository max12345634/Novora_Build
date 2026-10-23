'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const os=require('node:os'),fs=require('node:fs'),path=require('node:path');
const {archiveTicket,readHistory,tokenUrl}=require('../src/ticket-archive');
const g={id:'111111111111111111',name:'Shadow RP'};
function setup(){let tmp=fs.mkdtempSync(path.join(os.tmpdir(),'nv40-'));const store={dataDir:tmp,state:{},persist:async()=>{}};return {tmp,store};}
const basic=(id)=>({id,guildId:g.id,channelId:'444444444444444444',createdAt:1000,userId:'222222222222222222',staffId:'333333333333333333',kind:'report',title:'Mein Anliegen'});
function msg(id){return {id:String(900000000000000000n-BigInt(id)),content:'Text '+id,author:{id:'222222222222222222',username:'User',bot:false},createdTimestamp:100000+id,attachments:new Map()};}
test('archives 235 messages in pages, stores owner-only JSON and durable link index',async()=>{
 const {tmp,store}=setup();const t=basic('d750b26f-4d5f-41bf-a730-0123456789ab');let pages=0;
 const channel={id:t.channelId,messages:{fetch:async({limit,before})=>{pages++;const seq=Array.from({length:235},(_,i)=>msg(i)).reverse();const pos=before?seq.findIndex(m=>m.id===before)+1:0;return new Map(seq.slice(pos,pos+limit).map(m=>[m.id,m]));}}};
 try{
   const result=await archiveTicket({store,channel,guild:g,ticket:t,kind:'ticket',actorId:t.staffId,closedAt:200000});
   assert.equal(result.count,235);assert.equal(pages,3);assert.match(result.token,/^[0-9a-f]{48}$/);
   const content=JSON.parse(fs.readFileSync(result.file,'utf8'));
   assert.equal(content.items.length,235);assert.equal(content.closedBy,t.staffId);
   assert.ok((fs.statSync(result.file).mode&0o077)===0);
   assert.equal(store.state.supportTranscriptIndex[t.transcriptToken].file,result.file);
   assert.equal(tokenUrl('https://example.com',result.token),`https://example.com/transcript?token=${result.token}`);
 }finally{fs.rmSync(tmp,{recursive:true,force:true})}
});
test('missing Discord history permissions fail closed and do not register a transcript',async()=>{
 const {tmp,store}=setup();const t=basic('d750b26f-4d5f-41bf-a730-0123456789ac');
 const channel={id:t.channelId,messages:{fetch:async()=>{throw Error('Missing Permissions')}}};
 try{
   await assert.rejects(archiveTicket({store,channel,guild:g,ticket:t,kind:'ticket',actorId:t.staffId}),/Missing Permissions/);
   assert.equal(t.transcriptToken,undefined);assert.equal(store.state.supportTranscriptIndex,undefined);
 }finally{fs.rmSync(tmp,{recursive:true,force:true})}
});
test('unsafely partial maxed out transcript is rejected instead of deleting a ticket',async()=>{
 const channel={messages:{fetch:async()=>new Map([[msg(0).id,msg(0)],[msg(1).id,msg(1)]])}};
 await assert.rejects(readHistory(channel,{max:2}),/Limit/);
});
