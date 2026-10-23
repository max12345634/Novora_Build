'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const {archiveTicket}=require('../src/ticket-archive');
const {startWebsite}=require('../src/website');
const guild={id:'111111111111111111',name:'Novora'};
function fixture(){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'nv48-archive-'));
 const ticket={id:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',channelId:'555555555555555555',createdAt:1000,userId:'222222222222222222'};
 let content='Erster Stand';
 const channel={id:ticket.channelId,messages:{fetch:async()=>new Map([['message',{
  id:'666666666666666666',createdTimestamp:2000,author:{id:ticket.userId,username:'Test'},content,
  attachments:new Map([['image',{name:'beleg.png',url:'https://cdn.discordapp.com/attachments/1/2/beleg.png'}]])
 }]])}};
 const store={dataDir:tmp,state:{},persist:async()=>{}};
 const fetchFn=async()=>new Response(Buffer.from('ARCHIVED-IMAGE'),{status:200});
 const archive=()=>archiveTicket({store,channel,guild,ticket,kind:'ticket',actorId:ticket.userId,fetchFn});
 return {tmp,ticket,store,archive,setContent:value=>{content=value}};
}
test('V4.8: failed re-archive preserves old transcript bytes, token and archived attachment',async()=>{
 const f=fixture();try{
  const first=await f.archive(),before=fs.readFileSync(first.file,'utf8');
  const old=JSON.parse(before),oldGroup=old.items[0].attachments[0].localGroup;
  f.setContent('Zweiter Stand');f.store.persist=async()=>{throw Error('Disk full')};
  await assert.rejects(f.archive(),/Disk full/);
  assert.equal(fs.readFileSync(first.file,'utf8'),before);
  assert.equal(f.store.state.supportTranscriptIndex[first.token].file,first.file);
  assert.equal(f.ticket.transcriptToken,first.token);
  assert.equal(f.ticket.hasTranscript,true);
  assert.equal(fs.readFileSync(path.join(f.tmp,'support-transcripts',guild.id,oldGroup,'m0-a0'),'utf8'),'ARCHIVED-IMAGE');
 }finally{fs.rmSync(f.tmp,{recursive:true,force:true});}
});
test('V4.8: first archive with failed index commit restores original ticket flags',async()=>{
 const f=fixture();try{
  f.ticket.hasTranscript=false;f.store.persist=async()=>{throw Error('readonly')};
  await assert.rejects(f.archive(),/readonly/);
  assert.equal(f.ticket.hasTranscript,false);assert.equal(f.ticket.transcriptToken,undefined);
  assert.equal(Object.keys(f.store.state.supportTranscriptIndex).length,0);
 }finally{fs.rmSync(f.tmp,{recursive:true,force:true});}
});
test('V4.8: successful re-archive publishes new immutable snapshot without overwriting old one',async()=>{
 const f=fixture();try{
  const first=await f.archive(),before=fs.readFileSync(first.file,'utf8');
  f.setContent('Neuer Stand');const second=await f.archive();
  assert.notEqual(first.file,second.file);assert.equal(first.token,second.token);
  assert.equal(fs.readFileSync(first.file,'utf8'),before);
  assert.equal(f.store.state.supportTranscriptIndex[first.token].file,second.file);
  assert.match(fs.readFileSync(second.file,'utf8'),/Neuer Stand/);
 }finally{fs.rmSync(f.tmp,{recursive:true,force:true});}
});
test('V4.8: attachment endpoint rejects symlink file and symlink directory',async()=>{
 const f=fixture();let server;
 try{
  const result=await f.archive(),record=JSON.parse(fs.readFileSync(result.file,'utf8'));
  const group=record.items[0].attachments[0].localGroup;
  const groupDir=path.join(f.tmp,'support-transcripts',guild.id,group);
  const attachment=path.join(groupDir,'m0-a0');
  const privateFile=path.join(f.tmp,'secret.env');fs.writeFileSync(privateFile,'DO-NOT-LEAK');
  server=startWebsite({port:0,publicUrl:'http://127.0.0.1',websiteUrl:'https://example.invalid',store:f.store});
  if(!server.listening)await once(server,'listening');
  const url=`http://127.0.0.1:${server.address().port}/transcript/attachment?token=${result.token}&file=m0-a0`;
  assert.equal((await fetch(url)).status,200);
  fs.unlinkSync(attachment);fs.symlinkSync(privateFile,attachment);
  const fileLink=await fetch(url);assert.equal(fileLink.status,404);assert.doesNotMatch(await fileLink.text(),/DO-NOT-LEAK/);
  fs.unlinkSync(attachment);fs.renameSync(groupDir,groupDir+'-real');fs.symlinkSync(groupDir+'-real',groupDir,'dir');
  const dirLink=await fetch(url);assert.equal(dirLink.status,404);
 }finally{if(server)await new Promise(resolve=>server.close(resolve));fs.rmSync(f.tmp,{recursive:true,force:true});}
});
test('V4.8: uncertain commit keeps new files for an index that was written before persist threw',async()=>{
 const f=fixture();try{
  const first=await f.archive(),old=fs.readFileSync(first.file,'utf8');
  const durableIndex=path.join(f.tmp,'state-written-before-error.json');
  f.setContent('Persistierter Zwischenstand');
  f.store.persist=async()=>{fs.writeFileSync(durableIndex,JSON.stringify(f.store.state.supportTranscriptIndex));throw Error('post-write failure');};
  await assert.rejects(f.archive(),/post-write failure/);
  const onDisk=JSON.parse(fs.readFileSync(durableIndex,'utf8'))[first.token];
  assert.notEqual(onDisk.file,first.file);
  assert.match(fs.readFileSync(onDisk.file,'utf8'),/Persistierter Zwischenstand/);
  assert.equal(fs.readFileSync(first.file,'utf8'),old);
  assert.equal(f.store.state.supportTranscriptIndex[first.token].file,first.file);
 }finally{fs.rmSync(f.tmp,{recursive:true,force:true});}
});
test('V4.8: transcript token belonging to another ticket cannot be reassigned',async()=>{
 const f=fixture();try{
  const first=await f.archive();
  const original={...f.store.state.supportTranscriptIndex[first.token]};
  f.store.state.supportTranscriptIndex[first.token]={...original,ticketId:'other-ticket'};
  await assert.rejects(f.archive(),/anderen Ticket/);
  assert.deepEqual(f.store.state.supportTranscriptIndex[first.token],{...original,ticketId:'other-ticket'});
 }finally{fs.rmSync(f.tmp,{recursive:true,force:true});}
});
