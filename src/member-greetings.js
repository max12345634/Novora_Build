'use strict';
// Server-specific, opt-in Discord join/leave messages.
const {MessageFlags,PermissionFlagsBits}=require('discord.js');
const ui=require('./ui-v2');
const {serverTitle}=require('./panel-art');
function makeMemberGreetings({store}){
 store.state.memberGreetingSettings ||= {};
 function setting(guildId){return store.state.memberGreetingSettings[guildId]||null;}
 async function configure(guildId,{welcomeId,leaveId}){
  const previous=setting(guildId);
  store.state.memberGreetingSettings[guildId]={welcomeId:welcomeId||null,leaveId:leaveId||null,updatedAt:Date.now()};
  try { await store.persist(); }
  catch(error){
   // Do not activate a configuration that was not durably saved.
   if(previous)store.state.memberGreetingSettings[guildId]=previous;
   else delete store.state.memberGreetingSettings[guildId];
   throw error;
  }
  return setting(guildId);
 }
 async function event(member,type){
  if(!member?.guild?.id || !member?.id || member.user?.bot)return false;
  const cfg=setting(member.guild.id);if(!cfg)return false;
  if(type!=='join'&&type!=='leave')return false;
  const channelId=type==='join'?cfg.welcomeId:cfg.leaveId;
  if(!channelId)return false;
  const channel=await member.guild.channels.fetch(channelId).catch(()=>null);
  if(!channel?.send)return false;
  const name=serverTitle(member.guild.name);
  const nickname=String(member.user?.globalName||member.user?.username||'Mitglied').replace(/[@\u0000-\u001f]/g,'').slice(0,75);
  const icons=store.state.appEmojis||{};const mark=ui.customEmoji(icons,type==='join'?'nv_welcome':'nv_goodbye',type==='join'?'👋':'↩️');
  const payload=type==='join'?ui.payload({color:0x4AAA88,lines:[`# ${mark} Willkommen auf ${name}!`,
    `Schön, dass du da bist, <@${member.id}>. Wir freuen uns auf dich!`,
    'Bitte lies dir die Regeln durch. Bei Fragen hilft dir unser Support-Team gerne weiter.']}):
    ui.payload({color:0x657187,lines:[`# ${mark} Auf Wiedersehen!`,`**${nickname}** hat **${name}** verlassen.`,
    'Vielen Dank für die gemeinsame Zeit.']});
  payload.allowedMentions={parse:[],users:type==='join'?[member.id]:[]};
  await channel.send(payload);return true;
 }
 return {setting,configure,event};
}
module.exports={makeMemberGreetings};
