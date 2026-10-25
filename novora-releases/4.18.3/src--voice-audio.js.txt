'use strict';
// Background waiting music and voice introduction. Not a recorder.
const {existsSync,mkdirSync,renameSync,unlinkSync}=require('node:fs');
const {isUsableAudio}=require('./voice-cache');
const {spawn}=require('node:child_process');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {serverTitle}=require('./panel-art');
let voiceLib;
function getVoice(){if(voiceLib)return voiceLib;voiceLib=require('@discordjs/voice');return voiceLib;}
const INTRO=path.join(__dirname,'..','assets','audio','welcome-generic.ogg');
const MUSIC=path.join(__dirname,'..','assets','audio','waiting-music.ogg');
function spawnSafe(binary,args,timeout=10000){return new Promise((resolve,reject)=>{
 const proc=spawn(binary,args,{stdio:'ignore'});let settled=false;
 const alarm=setTimeout(()=>{if(!settled){proc.kill('SIGKILL');reject(new Error(binary+' timeout'));settled=true;}},timeout);
 proc.once('error',error=>{if(!settled){settled=true;clearTimeout(alarm);reject(error)}});
 proc.once('close',code=>{if(!settled){settled=true;clearTimeout(alarm);code===0?resolve():reject(new Error(binary+' exit '+code));}});
 });}
function makeVoiceAudio({client,dataDir,voice,createIntro,retryDelayMs=30000}){
 const sessions=new Map(),pending=new Map(),retryAfter=new Map();
 let closed=false;
 const voiceApi=()=>voice||getVoice();
 async function personalizedIntro(guild){
  const target=path.join(dataDir,'voice-cache');
  mkdirSync(target,{recursive:true,mode:0o700});
  const filename=guild.id+'-'+createHash('sha256').update(serverTitle(guild.name)).digest('hex').slice(0,10);
  const dest=path.join(target,filename+'.ogg');
  if(isUsableAudio(dest))return dest;
  const nonce=randomUUID();
  const raw=path.join(target,filename+'.'+nonce+'.wav');
  const tempOgg=path.join(target,filename+'.'+nonce+'.ogg');
  const spoken='Willkommen im Support von '+serverTitle(guild.name).replace(/[^\p{L}\p{N}\s-]/gu,'').slice(0,65)+'. Ich habe unser Support-Team bereits benachrichtigt. Hab bitte einen Moment Geduld. Wir kümmern uns gleich um dich.';
  try{
   await spawnSafe('espeak',['-v','de','-s','148','-p','47','-w',raw,spoken],8500);
   await spawnSafe('ffmpeg',['-y','-loglevel','error','-i',raw,'-stream_loop','-1','-i',MUSIC,'-filter_complex','[1:a]volume=0.22[m];[0:a][m]amix=inputs=2:duration=first[a]','-map','[a]','-c:a','libopus','-b:a','56k',tempOgg],8500);
   if(!isUsableAudio(tempOgg))throw new Error('Leere oder ungueltige Audioausgabe');
   renameSync(tempOgg,dest);
   unlinkSync(raw);return dest;
  }catch(e){
   for(const file of [raw,tempOgg])try{unlinkSync(file)}catch{}
   console.warn('Personalisierte Voice-Begrüßung nicht verfügbar; lokale Standard-Begrüßung wird verwendet:',e.message);return INTRO;
  }
 }
 function clear(guildId){const s=sessions.get(guildId);if(!s)return;
  sessions.delete(guildId);try{s.player.stop()}catch{};try{s.connection.destroy()}catch{};
 }
 async function enter(guild,waitingChannel){
  if(closed||!guild?.id||!waitingChannel?.id||!existsSync(MUSIC)||!existsSync(INTRO))return false;
  if((retryAfter.get(guild.id)||0)>Date.now())return false;
  const inflight=pending.get(guild.id);
  if(inflight)return inflight.channelId===waitingChannel.id?inflight.promise:false;
  const work=start(guild,waitingChannel);
  pending.set(guild.id,{channelId:waitingChannel.id,promise:work,cancelled:false});
  try{return await work;}finally{if(pending.get(guild.id)?.promise===work)pending.delete(guild.id);}
 }
 async function start(guild,waitingChannel){
  if(sessions.has(guild.id)){
   const active=sessions.get(guild.id);
   if(active.channelId!==waitingChannel.id)return false;
   try{
    const intro=await (createIntro?createIntro(guild):personalizedIntro(guild));
    if(sessions.get(guild.id)!==active)return false;
    active.stage='intro';active.player.play(voiceApi().createAudioResource(intro));return true;
   }catch(e){console.warn('Voice-Neuanmeldung:',e.message);return false;}
  }
  const me=await guild.members.fetchMe().catch(()=>null);
  if(closed||pending.get(guild.id)?.cancelled)return false;
  if(!me?.permissionsIn(waitingChannel)?.has(['Connect','Speak'])){console.warn('Novora Voice: Connect/Speak fehlt in '+guild.name);return false;}
  let connection=null;
  try{
   const v=voiceApi();const conn=v.joinVoiceChannel({guildId:guild.id,channelId:waitingChannel.id,adapterCreator:guild.voiceAdapterCreator,selfDeaf:true,selfMute:false});
   connection=conn;
   const player=v.createAudioPlayer({behaviors:{noSubscriber:v.NoSubscriberBehavior.Play}});
   const s={connection:conn,player,channelId:waitingChannel.id,stage:'intro'};sessions.set(guild.id,s);
   conn.subscribe(player);
   player.on('error',error=>{
    console.warn('Voice-Audio-Fehler:',error.message);
    if(sessions.get(guild.id)===s)clear(guild.id);
   });
   player.on(v.AudioPlayerStatus.Idle,()=>{
    if(sessions.get(guild.id)!==s)return;
    try{
     if(s.stage==='intro'){s.stage='music';player.play(v.createAudioResource(MUSIC));}
     else if(s.stage==='music')player.play(v.createAudioResource(MUSIC));
    }catch(error){console.warn('Voice-Wartemusik konnte nicht starten:',error.message);clear(guild.id);}
   });
   // The guild name is synthesized locally when espeak + FFmpeg exist, otherwise bundled voice is played.
   const intro=await (createIntro?createIntro(guild):personalizedIntro(guild));
   if(closed||pending.get(guild.id)?.cancelled||sessions.get(guild.id)!==s){clear(guild.id);return false;}
   player.play(v.createAudioResource(intro));
   retryAfter.delete(guild.id);
   return true;
  }catch(error){
   console.warn('Voice-Audio konnte nicht starten:',error.message);
   clear(guild.id);
   if(connection&&!connection.destroyed)try{connection.destroy();}catch{}
   // A transient Discord/voice failure must not disable this guild forever.
   retryAfter.set(guild.id,Date.now()+Math.max(0,retryDelayMs));
   return false;
  }
 }
 async function checkLeave(guild,waitingId){
  if(!guild?.id||!waitingId)return;
  const inProgress=pending.get(guild.id);
  const s=sessions.get(guild.id);
  if(s?.channelId!==waitingId&&inProgress?.channelId!==waitingId)return;
  const room=await guild.channels.fetch(waitingId).catch(()=>null);
  // Missing or partial channel member data is not proof that the room is empty.
  if(!room?.members||typeof room.members.some!=='function')return;
  if(!room.members.some(m=>!m.user?.bot)){
   if(inProgress?.channelId===waitingId)inProgress.cancelled=true;
   if(s?.channelId===waitingId)clear(guild.id);
  }
 }
 function shutdown(){closed=true;for(const task of pending.values())task.cancelled=true;for(const id of sessions.keys())clear(id);retryAfter.clear();}
 return {enter,checkLeave,shutdown,sessions};
}
module.exports={makeVoiceAudio,spawnSafe};
