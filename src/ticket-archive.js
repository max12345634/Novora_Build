'use strict';
// Novora transcript archiver. Do not delete a Discord channel unless the entire readable
// message history and a corresponding restricted, durable index have been persisted.
const fs=require('node:fs');
const path=require('node:path');
const {Readable,Transform}=require('node:stream');
const {pipeline}=require('node:stream/promises');
const {randomBytes,randomUUID}=require('node:crypto');
const MAX_MESSAGES=10000;
const plain=(v,max=4000)=>String(v??'').replace(/\u0000/g,'').slice(0,max);
const tokenUrl=(base,token)=>base&&token?`${String(base).replace(/\/$/,'')}/transcript?token=${encodeURIComponent(token)}`:null;
function validId(s){return /^[0-9]{16,22}$/.test(String(s||''));}
async function readHistory(channel,{max=MAX_MESSAGES}={}){
  if(!channel?.messages?.fetch)throw Error('Ticketverlauf nicht abrufbar. Kanal bleibt erhalten.');
  const output=[];
  let before=null;
  const seen=new Set();
  while(output.length<max){
    // fetch() must throw on missing VIEW_CHANNEL/READ_MESSAGE_HISTORY. No partial archives.
    const fetched=await channel.messages.fetch(before?{limit:100,before}:{limit:100});
    if(!fetched||typeof fetched.values!=='function')throw Error('Ticketverlauf unvollständig. Kanal bleibt erhalten.');
    const page=[...fetched.values()];
    if(!page.length)break;
    for(const item of page){
      const key=String(item.id||item.createdTimestamp||'');
      if(key&&seen.has(key))continue;
      if(key)seen.add(key);
      output.push({
        messageId:String(item.id||''),userId:String(item.author?.id||''),
        username:plain(item.author?.globalName||item.author?.username||'Unbekannt',90),
        bot:Boolean(item.author?.bot),at:Number(item.createdTimestamp||0),
        text:plain(item.content,4000),
        attachments:[...(item.attachments?.values?.()||[])].map(a=>({name:plain(a.name,128),url:/^https:\/\/[^\s]+$/i.test(String(a.url||''))?a.url:''})).slice(0,10)
      });
    }
    if(page.length<100)break;
    const last=String(page[page.length-1].id||'');
    if(!/^\d{16,22}$/.test(last)||last===before)throw Error('Ticketverlauf konnte nicht vollständig paginiert werden. Kanal bleibt erhalten.');
    before=last;
  }
  if(output.length>=max)throw Error(`Ticketverlauf überschreitet das sichere Limit (${max} Nachrichten). Kanal bleibt erhalten; bitte ein separates Archiv erstellen.`);
  return output.sort((a,b)=>a.at-b.at);
}
const MAX_FILE_BYTES=25*1024*1024,MAX_TOTAL_BYTES=120*1024*1024,MAX_FILES=80;
function trustedAttachmentURL(value){
 try{const url=new URL(value);return url.protocol==='https:'&&['cdn.discordapp.com','media.discordapp.net'].includes(url.hostname)&&url.username===''&&url.password===''?url:null;}catch{return null;}
}
async function retainAttachments(items,dir,ticketId,fetchFn=globalThis.fetch){
 const group=ticketId+'-files-'+randomUUID();
 const dest=path.join(dir,group);let totalBytes=0,count=0;
 const list=items.flatMap((item,mi)=>(item.attachments||[]).map((a,ai)=>({a,mi,ai})));
 if(list.length>MAX_FILES)throw Error('Zu viele Anhänge für die sichere Archivierung. Kanal bleibt erhalten.');
 if(!list.length)return null;
 await fs.promises.mkdir(dest,{recursive:true,mode:0o700});
 try{
  for(const {a,mi,ai} of list){
   const url=trustedAttachmentURL(a.url);
   if(!url)throw Error('Ein Ticket-Anhang hat keine sichere Discord-CDN-Adresse. Kanal bleibt erhalten.');
   const fileId='m'+mi+'-a'+ai;
   const response=await fetchFn(url.href,{redirect:'error',signal:AbortSignal.timeout(20000)});
   if(!response?.ok||!response.body)throw Error('Ein Ticket-Anhang konnte nicht gesichert werden. Kanal bleibt erhalten.');
   const length=Number(response.headers?.get?.('content-length')||0);
   if(length>MAX_FILE_BYTES||length+totalBytes>MAX_TOTAL_BYTES)throw Error('Ticket-Anhang überschreitet das Archivlimit (25 MB/Datei; 120 MB/Ticket). Kanal bleibt erhalten.');
   let size=0;
   try{
    await pipeline(Readable.fromWeb(response.body),new Transform({transform(chunk,_enc,cb){size+=chunk.length;totalBytes+=chunk.length;
     if(size>MAX_FILE_BYTES||totalBytes>MAX_TOTAL_BYTES)return cb(new Error('Ticket-Anhang zu groß. Kanal bleibt erhalten.'));cb(null,chunk);
    }}),fs.createWriteStream(path.join(dest,fileId),{flags:'wx',mode:0o600}));
   }catch(e){throw Error('Anhang konnte nicht vollständig gespeichert werden. Kanal bleibt erhalten: '+e.message);}
   if(!size)throw Error('Leerer Download bei Ticket-Anhang. Kanal bleibt erhalten.');
   a.localFile=fileId;a.localGroup=group;a.bytes=size;count++;
  }
 }catch(err){await fs.promises.rm(dest,{recursive:true,force:true});throw err;}
 return {dir:dest,count,totalBytes};
}
async function archiveTicket({store,channel,guild,ticket,kind,actorId,closedAt=Date.now(),max=MAX_MESSAGES,fetchFn=globalThis.fetch}){
  if(!store?.dataDir||!validId(guild?.id))throw Error('Datenverzeichnis oder Guild-ID fehlt. Ticket nicht gelöscht.');
  if(!/^[0-9a-f-]{8,64}$/i.test(String(ticket?.id||'')))throw Error('Ungültige Ticket-ID.');
  if(channel?.id!==ticket.channelId)throw Error('Ticketkanal passt nicht zum Datensatz.');
  // Read all available messages before modifying any ticket state.
  const items=await readHistory(channel,{max});
  const dir=path.join(store.dataDir,'support-transcripts',guild.id);
  await fs.promises.mkdir(dir,{recursive:true,mode:0o700});
  const backedUp=await retainAttachments(items,dir,ticket.id,fetchFn);
  // Every archival attempt gets an immutable snapshot. Never overwrite the file
  // referenced by an earlier persisted token: a failed retry must not corrupt it.
  const file=path.join(dir,ticket.id+'-'+randomUUID()+'.json');
  const payload={schema:2,ticketId:ticket.id,guildId:guild.id,guildName:plain(guild.name,85),
    title:plain(ticket.title||ticket.form?.server||'Supportticket',100),kind,
    requesterId:String(ticket.userId||ticket.requesterId||''),staffId:String(ticket.staffId||ticket.claimedBy||''),
    closedBy:String(actorId||''),createdAt:Number(ticket.createdAt||0),closedAt,
    category:plain(ticket.kind||kind,70),messages:items.length,items,
    lifecycle:[{type:'created',at:ticket.createdAt},{type:'closed',at:closedAt,actorId:String(actorId||'')}]
  };
  const temp=path.join(dir,'.'+ticket.id+'-'+randomUUID()+'.tmp');
  try{
    await fs.promises.writeFile(temp,JSON.stringify(payload),{encoding:'utf8',flag:'wx',mode:0o600});
    await fs.promises.rename(temp,file);
  }catch(e){if(backedUp)await fs.promises.rm(backedUp.dir,{recursive:true,force:true});throw e;}finally{await fs.promises.unlink(temp).catch(()=>{});}
  const oldToken=ticket.transcriptToken;
  const token=/^[0-9a-f]{48}$/.test(String(oldToken||''))?oldToken:randomBytes(24).toString('hex');
  store.state.supportTranscriptIndex ||= {};
  const previous=store.state.supportTranscriptIndex[token];
  if(previous&&(previous.ticketId!==ticket.id||previous.guildId!==guild.id))
    throw Error('Transkript-Token gehört zu einem anderen Ticket. Kanal bleibt erhalten.');
  const oldHasTranscript=ticket.hasTranscript;
  store.state.supportTranscriptIndex[token]={ticketId:ticket.id,guildId:guild.id,file,guildName:guild.name,
    title:payload.title,kind,createdAt:closedAt};
  ticket.transcriptToken=token;
  ticket.hasTranscript=true;
  try{await store.persist();}
  catch(e){
    if(previous)store.state.supportTranscriptIndex[token]=previous;
    else delete store.state.supportTranscriptIndex[token];
    ticket.transcriptToken=oldToken;ticket.hasTranscript=oldHasTranscript;
    // Keep the new snapshot and its files. A persist() implementation may have
    // written the new index to disk before throwing; deleting the snapshot here
    // would create a broken link after restart. Unreferenced snapshots are safer.
    throw Error('Transkript-Index konnte nicht bestätigt werden. Kanal bleibt erhalten: '+e.message);
  }
  return {token,url:tokenUrl(store.publicUrl,token),file,count:items.length};
}
module.exports={archiveTicket,readHistory,tokenUrl,retainAttachments,trustedAttachmentURL,MAX_MESSAGES,MAX_FILE_BYTES,MAX_TOTAL_BYTES};
